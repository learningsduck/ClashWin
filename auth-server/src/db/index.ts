import initSqlJs, { type Database } from "sql.js";
import { config } from "../config.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrateSchema } from "./migrate.js";
import {
  collectUserSubscribeUrls,
  parseSubscribeBackups,
  serializeSubscribeBackups,
} from "./subscribe-urls.js";

export { collectUserSubscribeUrls, SUBSCRIBE_BACKUP_SLOTS } from "./subscribe-urls.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database | null = null;

function getDb(): Database {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

/** 启动时调用一次，初始化数据库（异步） */
export async function initDb(): Promise<void> {
  const dir = path.dirname(config.db.path);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      path.join(__dirname, "..", "..", "node_modules", "sql.js", "dist", file),
  });
  const fileExists = fs.existsSync(config.db.path);

  if (fileExists) {
    const buffer = fs.readFileSync(config.db.path);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      subscribe_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
  
  // 兼容旧数据库：如果 subscribe_url 列不存在则添加
  try {
    db.run("ALTER TABLE users ADD COLUMN subscribe_url TEXT");
  } catch {
    // 列已存在，忽略错误
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_id TEXT NOT NULL UNIQUE,
      device_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_sessions_token_id ON sessions(token_id)");
  db.run(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone)");

  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      plan_type TEXT NOT NULL DEFAULT 'monthly',
      start_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      expire_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_subscriptions_expire_at ON subscriptions(expire_at)");

  db.run(`
    CREATE TABLE IF NOT EXISTS recharge_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      admin_id INTEGER NOT NULL,
      days_added INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      remark TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (admin_id) REFERENCES admins(id)
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_recharge_logs_user_id ON recharge_logs(user_id)");

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_username ON admins(username)");

  migrateSchema(db);

  const { bindSubscriptionPoolDb, initSubscriptionPoolTable } = await import(
    "./subscription-pool.js"
  );
  bindSubscriptionPoolDb(() => getDb(), persist);
  initSubscriptionPoolTable();

  persist();
}

const USER_SELECT =
  "SELECT id, phone, email, subscribe_url, subscribe_url_backups, password_hash, password_updated_at, status, created_at, updated_at FROM users";

function persist(): void {
  if (db) {
    const data = db.export();
    fs.writeFileSync(config.db.path, Buffer.from(data));
  }
}

export type User = {
  id: number;
  phone: string | null;
  email: string | null;
  subscribe_url: string | null;
  subscribe_url_backups: string[];
  password_hash: string | null;
  password_updated_at: number | null;
  status: string;
  created_at: number;
  updated_at: number;
};
export type Session = {
  id: number;
  user_id: number;
  token_id: string;
  device_id: string;
  login_method: string;
  created_at: number;
};
export type Subscription = {
  id: number;
  user_id: number;
  plan_type: string;
  start_at: number;
  expire_at: number;
  status: string;
  created_at: number;
  updated_at: number;
};
export type RechargeLog = {
  id: number;
  user_id: number;
  admin_id: number;
  days_added: number;
  amount: number;
  remark: string | null;
  created_at: number;
};
export type Admin = {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: number;
};

function rowToUser(row: (string | number | null)[]): User {
  return {
    id: row[0] as number,
    phone: (row[1] as string | null) ?? null,
    email: (row[2] as string | null) ?? null,
    subscribe_url: (row[3] as string | null) ?? null,
    subscribe_url_backups: parseSubscribeBackups(row[4] as string | null),
    password_hash: (row[5] as string | null) ?? null,
    password_updated_at: (row[6] as number | null) ?? null,
    status: (row[7] as string) || "active",
    created_at: row[8] as number,
    updated_at: (row[9] as number) ?? (row[8] as number),
  };
}

/** 兼容旧库仅 4 列查询时的行映射 */
function rowToUserLegacy(row: (string | number | null)[]): User {
  return {
    id: row[0] as number,
    phone: row[1] as string,
    email: null,
    subscribe_url: row[2] as string | null,
    subscribe_url_backups: [],
    password_hash: null,
    password_updated_at: null,
    status: "active",
    created_at: row[3] as number,
    updated_at: row[3] as number,
  };
}

function rowToSession(row: (string | number | null)[]): Session {
  return {
    id: row[0] as number,
    user_id: row[1] as number,
    token_id: row[2] as string,
    device_id: row[3] as string,
    login_method: (row[4] as string) || "sms",
    created_at: row[5] as number,
  };
}
function rowToSubscription(row: (string | number | null)[]): Subscription {
  return {
    id: row[0] as number,
    user_id: row[1] as number,
    plan_type: row[2] as string,
    start_at: row[3] as number,
    expire_at: row[4] as number,
    status: row[5] as string,
    created_at: row[6] as number,
    updated_at: row[7] as number,
  };
}
function rowToRechargeLog(row: (string | number | null)[]): RechargeLog {
  return {
    id: row[0] as number,
    user_id: row[1] as number,
    admin_id: row[2] as number,
    days_added: row[3] as number,
    amount: row[4] as number,
    remark: row[5] as string | null,
    created_at: row[6] as number,
  };
}
function rowToAdmin(row: (string | number)[]): Admin {
  return {
    id: row[0] as number,
    username: row[1] as string,
    password_hash: row[2] as string,
    role: row[3] as string,
    created_at: row[4] as number,
  };
}

export function findUserByPhone(phone: string): User | undefined {
  const d = getDb();
  const stmt = d.prepare(`${USER_SELECT} WHERE phone = ?`);
  stmt.bind([phone]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number | null)[] | undefined;
    stmt.free();
    return row ? rowToUser(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function findUserByEmail(email: string): User | undefined {
  const d = getDb();
  const stmt = d.prepare(`${USER_SELECT} WHERE email = ?`);
  stmt.bind([email]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number | null)[] | undefined;
    stmt.free();
    return row ? rowToUser(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function createUser(phone: string): User {
  const d = getDb();
  d.run("INSERT INTO users (phone) VALUES (?)", [phone]);
  persist();
  return findUserByPhone(phone)!;
}

/** 管理员创建账户：手机号、邮箱至少一项 + 密码 */
export function createUserByAdmin(params: {
  phone: string | null;
  email: string | null;
  passwordHash: string;
}): User {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    `INSERT INTO users (phone, email, password_hash, password_updated_at, status, updated_at, created_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    [params.phone, params.email, params.passwordHash, now, now, now],
  );
  persist();
  if (params.phone) return findUserByPhone(params.phone)!;
  return findUserByEmail(params.email!)!;
}

export function findOrCreateUser(phone: string): User {
  let u = findUserByPhone(phone);
  if (!u) u = createUser(phone);
  return u;
}

export function createSession(
  userId: number,
  tokenId: string,
  deviceId: string,
  loginMethod: string = "sms",
): void {
  const d = getDb();
  d.run(
    "INSERT INTO sessions (user_id, token_id, device_id, login_method) VALUES (?, ?, ?, ?)",
    [userId, tokenId, deviceId, loginMethod],
  );
  persist();
}

export function deleteAllSessionsForUser(userId: number): void {
  const d = getDb();
  d.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  persist();
}

export function invalidateOtherSessions(userId: number, currentTokenId: string): void {
  const d = getDb();
  d.run("DELETE FROM sessions WHERE user_id = ? AND token_id != ?", [userId, currentTokenId]);
  persist();
}

export function findSessionByTokenId(tokenId: string): Session | undefined {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT id, user_id, token_id, device_id, login_method, created_at FROM sessions WHERE token_id = ?",
  );
  stmt.bind([tokenId]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number)[] | undefined;
    stmt.free();
    return row ? rowToSession(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function deleteSession(tokenId: string): void {
  const d = getDb();
  d.run("DELETE FROM sessions WHERE token_id = ?", [tokenId]);
  persist();
}

export function saveSmsCode(phone: string, code: string, expiresAt: number): void {
  const d = getDb();
  d.run("INSERT INTO sms_codes (phone, code, expires_at) VALUES (?, ?, ?)", [
    phone,
    code,
    expiresAt,
  ]);
  persist();
}

export function getLatestSmsCode(phone: string): { code: string; expires_at: number } | undefined {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT code, expires_at FROM sms_codes WHERE phone = ? ORDER BY id DESC LIMIT 1"
  );
  stmt.bind([phone]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return row ? { code: row[0] as string, expires_at: row[1] as number } : undefined;
  }
  stmt.free();
  return undefined;
}

export function getLatestSmsSendTime(phone: string): number | null {
  return getLastVerificationSendTime("sms", phone);
}

export function saveEmailCode(
  email: string,
  code: string,
  expiresAt: number,
  purpose: string = "bind_email",
): void {
  const d = getDb();
  d.run("INSERT INTO email_codes (email, code, purpose, expires_at) VALUES (?, ?, ?, ?)", [
    email,
    code,
    purpose,
    expiresAt,
  ]);
  persist();
}

export function getLatestEmailCode(
  email: string,
  purpose: string,
): { code: string; expires_at: number } | undefined {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT code, expires_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
  );
  stmt.bind([email, purpose]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return row ? { code: row[0] as string, expires_at: row[1] as number } : undefined;
  }
  stmt.free();
  return undefined;
}

export function logVerificationSend(
  channel: "sms" | "email",
  target: string,
  purpose: string,
  ip?: string,
): void {
  const d = getDb();
  d.run(
    "INSERT INTO verification_send_logs (channel, target, purpose, ip) VALUES (?, ?, ?, ?)",
    [channel, target, purpose, ip ?? null],
  );
  persist();
}

export function getLastVerificationSendTime(
  channel: "sms" | "email",
  target: string,
): number | null {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT created_at FROM verification_send_logs WHERE channel = ? AND target = ? ORDER BY id DESC LIMIT 1",
  );
  stmt.bind([channel, target]);
  if (stmt.step()) {
    const row = stmt.get();
    stmt.free();
    return row ? (row[0] as number) : null;
  }
  stmt.free();
  return null;
}

export function countVerificationSends(
  channel: "sms" | "email",
  target: string,
  sinceUnix: number,
): number {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT COUNT(*) FROM verification_send_logs WHERE channel = ? AND target = ? AND created_at >= ?",
  );
  stmt.bind([channel, target, sinceUnix]);
  stmt.step();
  const row = stmt.get();
  stmt.free();
  return row ? (row[0] as number) : 0;
}

export function bindEmailAndPassword(
  userId: number,
  email: string,
  passwordHash: string,
): User | undefined {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    "UPDATE users SET email = ?, password_hash = ?, password_updated_at = ?, updated_at = ? WHERE id = ?",
    [email, passwordHash, now, now, userId],
  );
  persist();
  return findUserById(userId);
}

export function updateUserPassword(userId: number, passwordHash: string): void {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    "UPDATE users SET password_hash = ?, password_updated_at = ?, updated_at = ? WHERE id = ?",
    [passwordHash, now, now, userId],
  );
  persist();
}

export function setUserStatus(userId: number, status: "active" | "disabled"): void {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run("UPDATE users SET status = ?, updated_at = ? WHERE id = ?", [status, now, userId]);
  persist();
}

export function countActiveSubscriptions(now: number): number {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT COUNT(*) FROM subscriptions WHERE expire_at > ? AND status = 'active'",
  );
  stmt.bind([now]);
  stmt.step();
  const row = stmt.get();
  stmt.free();
  return row ? (row[0] as number) : 0;
}

export function searchUsers(
  limit: number,
  offset: number,
  search: string,
): User[] {
  const d = getDb();
  const q = search.trim();
  let sql = `${USER_SELECT}`;
  const params: (string | number)[] = [];
  if (q) {
    if (/^\d+$/.test(q)) {
      sql += " WHERE id = ? OR phone LIKE ? OR email LIKE ?";
      params.push(parseInt(q, 10), `%${q}%`, `%${q}%`);
    } else {
      sql += " WHERE phone LIKE ? OR email LIKE ?";
      params.push(`%${q}%`, `%${q}%`);
    }
  }
  sql += " ORDER BY id DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);
  const stmt = d.prepare(sql);
  stmt.bind(params);
  const users: User[] = [];
  while (stmt.step()) {
    users.push(rowToUser(stmt.get() as (string | number | null)[]));
  }
  stmt.free();
  return users;
}

export function getSubscriptionByUserId(userId: number): Subscription | undefined {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT id, user_id, plan_type, start_at, expire_at, status, created_at, updated_at FROM subscriptions WHERE user_id = ?"
  );
  stmt.bind([userId]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number | null)[] | undefined;
    stmt.free();
    return row ? rowToSubscription(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function createSubscription(
  userId: number,
  expireAt: number,
  planType: string = "monthly"
): Subscription {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    "INSERT INTO subscriptions (user_id, plan_type, start_at, expire_at, status) VALUES (?, ?, ?, ?, ?)",
    [userId, planType, now, expireAt, "active"]
  );
  persist();
  return getSubscriptionByUserId(userId)!;
}

export function updateSubscriptionExpireAt(userId: number, expireAt: number): void {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run("UPDATE subscriptions SET expire_at = ?, updated_at = ? WHERE user_id = ?", [
    expireAt,
    now,
    userId,
  ]);
  persist();
}

/** 将用户会员到期日设为指定时间（不叠加，以该时间为准） */
export function setUserSubscriptionExpireAt(userId: number, expireAt: number): Subscription {
  const existing = getSubscriptionByUserId(userId);
  if (existing) {
    updateSubscriptionExpireAt(userId, expireAt);
    return getSubscriptionByUserId(userId)!;
  }
  const now = Math.floor(Date.now() / 1000);
  return createSubscription(userId, expireAt, "monthly");
}

export function extendSubscription(userId: number, daysToAdd: number): Subscription {
  const existing = getSubscriptionByUserId(userId);
  const now = Math.floor(Date.now() / 1000);
  const secondsToAdd = daysToAdd * 24 * 60 * 60;

  if (existing) {
    const baseTime = existing.expire_at > now ? existing.expire_at : now;
    const newExpireAt = baseTime + secondsToAdd;
    updateSubscriptionExpireAt(userId, newExpireAt);
    return getSubscriptionByUserId(userId)!;
  } else {
    const expireAt = now + secondsToAdd;
    return createSubscription(userId, expireAt, "monthly");
  }
}

export function createRechargeLog(
  userId: number,
  adminId: number,
  daysAdded: number,
  amount: number = 0,
  remark: string | null = null
): void {
  const d = getDb();
  d.run(
    "INSERT INTO recharge_logs (user_id, admin_id, days_added, amount, remark) VALUES (?, ?, ?, ?, ?)",
    [userId, adminId, daysAdded, amount, remark]
  );
  persist();
}

export function getRechargeLogs(limit: number = 100, offset: number = 0): RechargeLog[] {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT id, user_id, admin_id, days_added, amount, remark, created_at FROM recharge_logs ORDER BY id DESC LIMIT ? OFFSET ?"
  );
  stmt.bind([limit, offset]);
  const logs: RechargeLog[] = [];
  while (stmt.step()) {
    const row = stmt.get() as (string | number | null)[];
    logs.push(rowToRechargeLog(row));
  }
  stmt.free();
  return logs;
}

export function getRechargeLogsByUserId(userId: number): RechargeLog[] {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT id, user_id, admin_id, days_added, amount, remark, created_at FROM recharge_logs WHERE user_id = ? ORDER BY id DESC"
  );
  stmt.bind([userId]);
  const logs: RechargeLog[] = [];
  while (stmt.step()) {
    const row = stmt.get() as (string | number | null)[];
    logs.push(rowToRechargeLog(row));
  }
  stmt.free();
  return logs;
}

export function findAdminByUsername(username: string): Admin | undefined {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT id, username, password_hash, role, created_at FROM admins WHERE username = ?"
  );
  stmt.bind([username]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number)[] | undefined;
    stmt.free();
    return row ? rowToAdmin(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function findAdminById(id: number): Admin | undefined {
  const d = getDb();
  const stmt = d.prepare(
    "SELECT id, username, password_hash, role, created_at FROM admins WHERE id = ?"
  );
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number)[] | undefined;
    stmt.free();
    return row ? rowToAdmin(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function createAdmin(username: string, passwordHash: string, role: string = "admin"): Admin {
  const d = getDb();
  d.run("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)", [
    username,
    passwordHash,
    role,
  ]);
  persist();
  return findAdminByUsername(username)!;
}

export function getAllUsers(limit: number = 100, offset: number = 0): User[] {
  return searchUsers(limit, offset, "");
}

export function getUserCount(): number {
  const d = getDb();
  const stmt = d.prepare("SELECT COUNT(*) FROM users");
  stmt.step();
  const row = stmt.get();
  stmt.free();
  return row ? (row[0] as number) : 0;
}

export function findUserById(id: number): User | undefined {
  const d = getDb();
  const stmt = d.prepare(`${USER_SELECT} WHERE id = ?`);
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number | null)[] | undefined;
    stmt.free();
    return row ? rowToUser(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function setUserSubscribeUrls(
  userId: number,
  subscribeUrl: string | null,
  backups: string[] = [],
): void {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    "UPDATE users SET subscribe_url = ?, subscribe_url_backups = ?, updated_at = ? WHERE id = ?",
    [subscribeUrl, serializeSubscribeBackups(backups), now, userId],
  );
  persist();
}

/** @deprecated 使用 setUserSubscribeUrls */
export function setUserSubscribeUrl(userId: number, subscribeUrl: string | null): void {
  setUserSubscribeUrls(userId, subscribeUrl, []);
}
