import type { Database } from "sql.js";

function tryRun(db: Database, sql: string): void {
  try {
    db.run(sql);
  } catch {
    // 列/索引已存在
  }
}

export function migrateSchema(db: Database): void {
  tryRun(db, "ALTER TABLE users ADD COLUMN email TEXT");
  tryRun(db, "ALTER TABLE users ADD COLUMN password_hash TEXT");
  tryRun(db, "ALTER TABLE users ADD COLUMN password_updated_at INTEGER");
  tryRun(db, "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  tryRun(db, "ALTER TABLE users ADD COLUMN updated_at INTEGER");

  db.run(`
    UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''
  `);
  db.run(`
    UPDATE users SET updated_at = created_at WHERE updated_at IS NULL
  `);

  tryRun(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL");

  db.run(`
    CREATE TABLE IF NOT EXISTS email_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'bind_email',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
  db.run("CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email)");

  db.run(`
    CREATE TABLE IF NOT EXISTS verification_send_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      target TEXT NOT NULL,
      purpose TEXT NOT NULL,
      ip TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_verification_send ON verification_send_logs(channel, target, created_at)",
  );

  tryRun(db, "ALTER TABLE sessions ADD COLUMN login_method TEXT DEFAULT 'sms'");
  tryRun(db, "ALTER TABLE sms_codes ADD COLUMN purpose TEXT DEFAULT 'login'");
  tryRun(db, "ALTER TABLE users ADD COLUMN subscribe_url_backups TEXT");

  migrateUsersPhoneOptional(db);
}

/** 允许 users.phone 为空（仅邮箱注册） */
function migrateUsersPhoneOptional(db: Database): void {
  const stmt = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
  );
  let createSql: string | undefined;
  if (stmt.step()) {
    const row = stmt.get() as (string | null)[] | undefined;
    createSql = row?.[0] ?? undefined;
  }
  stmt.free();
  if (!createSql || !createSql.includes("phone TEXT NOT NULL")) {
    return;
  }

  db.run("PRAGMA foreign_keys=OFF");
  db.run(`
    CREATE TABLE users_contact_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE,
      subscribe_url TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      email TEXT,
      password_hash TEXT,
      password_updated_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      updated_at INTEGER
    )
  `);
  db.run(`
    INSERT INTO users_contact_mig (
      id, phone, subscribe_url, created_at, email, password_hash,
      password_updated_at, status, updated_at
    )
    SELECT
      id, phone, subscribe_url, created_at, email, password_hash,
      password_updated_at, COALESCE(status, 'active'), updated_at
    FROM users
  `);
  db.run("DROP TABLE users");
  db.run("ALTER TABLE users_contact_mig RENAME TO users");
  tryRun(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL");
  db.run("PRAGMA foreign_keys=ON");
}
