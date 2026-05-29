import {
  parseSubscribeBackups,
  serializeSubscribeBackups,
  SUBSCRIBE_BACKUP_SLOTS,
} from "./subscribe-urls.js";

/** 由 db/index 在初始化后注入，避免循环依赖 */
let getDbRef: () => import("sql.js").Database;
let persistRef: () => void;

export function bindSubscriptionPoolDb(
  getDb: () => import("sql.js").Database,
  persist: () => void,
): void {
  getDbRef = getDb;
  persistRef = persist;
}

function getDb() {
  if (!getDbRef) throw new Error("subscription pool db not bound");
  return getDbRef();
}

function persist() {
  persistRef();
}

function tryRun(sql: string, params?: (string | number | null)[]): void {
  try {
    if (params) getDb().run(sql, params);
    else getDb().run(sql);
  } catch {
    // 列已存在等
  }
}

function getTableColumns(table: string): Set<string> {
  const d = getDb();
  const cols = new Set<string>();
  try {
    const stmt = d.prepare(`PRAGMA table_info(${table})`);
    while (stmt.step()) {
      const row = stmt.get() as [number, string, string, number, unknown, number];
      cols.add(row[1]);
    }
    stmt.free();
  } catch {
    // 表不存在
  }
  return cols;
}

/** 旧版含 duration_days 的表结构迁移为仅 expire_at */
function rebuildSubscriptionPoolIfLegacy(): void {
  const cols = getTableColumns("subscription_pool");
  if (cols.size === 0 || !cols.has("duration_days")) return;

  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  tryRun("ALTER TABLE subscription_pool ADD COLUMN expire_at INTEGER");
  try {
    d.run(
      `UPDATE subscription_pool
       SET expire_at = ? + COALESCE(duration_days, 30) * 86400
       WHERE expire_at IS NULL`,
      [now],
    );
  } catch {
    // ignore
  }

  d.run("PRAGMA foreign_keys=OFF");
  d.run(`
    CREATE TABLE subscription_pool_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subscribe_url TEXT NOT NULL,
      subscribe_url_backups TEXT,
      expire_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      created_by_admin_id INTEGER,
      FOREIGN KEY (created_by_admin_id) REFERENCES admins(id)
    )
  `);
  d.run(
    `
    INSERT INTO subscription_pool_v2 (
      id, name, subscribe_url, subscribe_url_backups, expire_at, created_at, updated_at, created_by_admin_id
    )
    SELECT
      id, name, subscribe_url, subscribe_url_backups,
      COALESCE(expire_at, ? + COALESCE(duration_days, 30) * 86400),
      created_at, updated_at, created_by_admin_id
    FROM subscription_pool
  `,
    [now],
  );
  d.run("DROP TABLE subscription_pool");
  d.run("ALTER TABLE subscription_pool_v2 RENAME TO subscription_pool");
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_subscription_pool_name ON subscription_pool(name)",
  );
  d.run("PRAGMA foreign_keys=ON");
  persist();
}

export type SubscriptionPoolItem = {
  id: number;
  name: string;
  subscribe_url: string;
  subscribe_url_backups: string[];
  expire_at: number;
  created_at: number;
  updated_at: number;
  created_by_admin_id: number | null;
};

const POOL_SELECT =
  "SELECT id, name, subscribe_url, subscribe_url_backups, expire_at, created_at, updated_at, created_by_admin_id FROM subscription_pool";

function rowToPoolItem(row: (string | number | null)[]): SubscriptionPoolItem {
  return {
    id: row[0] as number,
    name: row[1] as string,
    subscribe_url: row[2] as string,
    subscribe_url_backups: parseSubscribeBackups(row[3] as string | null),
    expire_at: row[4] as number,
    created_at: row[5] as number,
    updated_at: row[6] as number,
    created_by_admin_id: (row[7] as number | null) ?? null,
  };
}

export function initSubscriptionPoolTable(): void {
  const d = getDb();
  d.run(`
    CREATE TABLE IF NOT EXISTS subscription_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subscribe_url TEXT NOT NULL,
      subscribe_url_backups TEXT,
      expire_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      created_by_admin_id INTEGER,
      FOREIGN KEY (created_by_admin_id) REFERENCES admins(id)
    )
  `);
  d.run(
    "CREATE INDEX IF NOT EXISTS idx_subscription_pool_name ON subscription_pool(name)",
  );

  tryRun("ALTER TABLE subscription_pool ADD COLUMN expire_at INTEGER");

  const now = Math.floor(Date.now() / 1000);
  try {
    d.run(
      `UPDATE subscription_pool
       SET expire_at = ? + COALESCE(duration_days, 30) * 86400
       WHERE expire_at IS NULL`,
      [now],
    );
  } catch {
    // 旧库无 duration_days 列时忽略
  }

  rebuildSubscriptionPoolIfLegacy();
}

export function listSubscriptionPool(): SubscriptionPoolItem[] {
  const d = getDb();
  const stmt = d.prepare(`${POOL_SELECT} ORDER BY id DESC`);
  const items: SubscriptionPoolItem[] = [];
  while (stmt.step()) {
    items.push(rowToPoolItem(stmt.get() as (string | number | null)[]));
  }
  stmt.free();
  return items;
}

export function findSubscriptionPoolById(id: number): SubscriptionPoolItem | undefined {
  const d = getDb();
  const stmt = d.prepare(`${POOL_SELECT} WHERE id = ?`);
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.get() as (string | number | null)[] | undefined;
    stmt.free();
    return row ? rowToPoolItem(row) : undefined;
  }
  stmt.free();
  return undefined;
}

export function createSubscriptionPoolItem(params: {
  name: string;
  subscribe_url: string;
  subscribe_url_backups: string[];
  expire_at: number;
  created_by_admin_id: number | null;
}): SubscriptionPoolItem {
  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    `INSERT INTO subscription_pool (
      name, subscribe_url, subscribe_url_backups, expire_at, created_at, updated_at, created_by_admin_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      params.name,
      params.subscribe_url,
      serializeSubscribeBackups(params.subscribe_url_backups),
      params.expire_at,
      now,
      now,
      params.created_by_admin_id,
    ],
  );
  persist();
  const stmt = d.prepare("SELECT last_insert_rowid()");
  stmt.step();
  const id = (stmt.get() as [number])[0];
  stmt.free();
  return findSubscriptionPoolById(id)!;
}

export function updateSubscriptionPoolItem(
  id: number,
  params: {
    name: string;
    subscribe_url: string;
    subscribe_url_backups: string[];
    expire_at: number;
  },
): SubscriptionPoolItem | undefined {
  const existing = findSubscriptionPoolById(id);
  if (!existing) return undefined;

  const d = getDb();
  const now = Math.floor(Date.now() / 1000);
  d.run(
    `UPDATE subscription_pool SET
      name = ?, subscribe_url = ?, subscribe_url_backups = ?, expire_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      params.name,
      params.subscribe_url,
      serializeSubscribeBackups(params.subscribe_url_backups),
      params.expire_at,
      now,
      id,
    ],
  );
  persist();
  return findSubscriptionPoolById(id);
}

export function deleteSubscriptionPoolItem(id: number): boolean {
  const existing = findSubscriptionPoolById(id);
  if (!existing) return false;
  const d = getDb();
  d.run("DELETE FROM subscription_pool WHERE id = ?", [id]);
  persist();
  return true;
}

export function countSubscriptionPool(): number {
  const d = getDb();
  const stmt = d.prepare("SELECT COUNT(*) FROM subscription_pool");
  stmt.step();
  const count = (stmt.get() as [number])[0];
  stmt.free();
  return count;
}

export function normalizePoolBackupsInput(backups: unknown): string[] {
  const slots = Array.from({ length: SUBSCRIBE_BACKUP_SLOTS }, () => "");
  if (!Array.isArray(backups)) return slots;
  for (let i = 0; i < SUBSCRIBE_BACKUP_SLOTS; i++) {
    const item = backups[i];
    slots[i] = typeof item === "string" ? item.trim() : "";
  }
  return slots;
}
