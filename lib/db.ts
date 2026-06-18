import Database from "better-sqlite3"
import path from "path"
import bcryptjs from "bcryptjs"
import crypto from "crypto"

const DATA_DIR = process.env.DATA_DIR ?? process.cwd()
const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, "money-management.db")

export const db = new Database(DB_PATH)
db.pragma("journal_mode = WAL")
db.pragma("foreign_keys = ON")

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS credentials (
    username      TEXT NOT NULL PRIMARY KEY,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token      TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "user" (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS income_categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    user_id    TEXT REFERENCES "user"(id) ON DELETE CASCADE,
    color      TEXT,
    is_hidden  INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    year       INTEGER
  );

  CREATE TABLE IF NOT EXISTS expense_types (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    user_id    TEXT REFERENCES "user"(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    year       INTEGER
  );

  CREATE TABLE IF NOT EXISTS expense_categories (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    type_id            TEXT REFERENCES expense_types(id) ON DELETE CASCADE,
    is_default         INTEGER NOT NULL DEFAULT 0,
    user_id            TEXT REFERENCES "user"(id) ON DELETE CASCADE,
    is_hidden          INTEGER NOT NULL DEFAULT 0,
    default_percentage REAL NOT NULL DEFAULT 0,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    year               INTEGER
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    percentage  REAL NOT NULL DEFAULT 0,
    month       INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, category_id, month, year)
  );

  CREATE TABLE IF NOT EXISTS type_allocations (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type_id    TEXT NOT NULL REFERENCES expense_types(id) ON DELETE CASCADE,
    percentage REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    year       INTEGER,
    UNIQUE(user_id, type_id, year)
  );

  CREATE TABLE IF NOT EXISTS year_budget_settings (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    year             INTEGER NOT NULL,
    max_expense_pct  REAL NOT NULL DEFAULT 100,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, year)
  );

  CREATE TABLE IF NOT EXISTS category_nominal_budgets (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    nominal     REAL NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, category_id, year)
  );

  CREATE TABLE IF NOT EXISTS wallet_categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    is_liquid  INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wallets (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    category_id     TEXT NOT NULL REFERENCES wallet_categories(id),
    name            TEXT NOT NULL,
    is_liquid       INTEGER NOT NULL DEFAULT 1,
    color           TEXT,
    icon            TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    balance         REAL NOT NULL DEFAULT 0,
    initial_balance REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    name        TEXT NOT NULL,
    category_id TEXT REFERENCES income_categories(id) ON DELETE SET NULL,
    wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    amount      REAL NOT NULL CHECK (amount > 0),
    month       INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    is_initial  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    name        TEXT NOT NULL,
    wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
    needs_type  TEXT NOT NULL DEFAULT 'PRIMER' CHECK (needs_type IN ('PRIMER', 'SEKUNDER', 'TERSIER')),
    amount      REAL NOT NULL CHECK (amount > 0),
    month       INTEGER NOT NULL,
    year        INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    is_initial  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS loans_given (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    borrower   TEXT NOT NULL,
    amount     REAL NOT NULL CHECK (amount > 0),
    status     TEXT NOT NULL DEFAULT 'FIX' CHECK (status IN ('FIX', 'GANTUNG')),
    notes      TEXT,
    month      INTEGER NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS loans_taken (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    lender     TEXT NOT NULL,
    amount     REAL NOT NULL CHECK (amount > 0),
    notes      TEXT,
    month      INTEGER NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    from_wallet_id TEXT NOT NULL REFERENCES wallets(id),
    to_wallet_id   TEXT NOT NULL REFERENCES wallets(id),
    amount         REAL NOT NULL CHECK (amount > 0),
    date           TEXT NOT NULL,
    month          INTEGER NOT NULL,
    year           INTEGER NOT NULL,
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    is_initial     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS investment_categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS investment_goals (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    target_amount REAL,
    target_date   TEXT,
    color         TEXT,
    is_active     INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS investments (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES investment_categories(id),
    name        TEXT NOT NULL,
    wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    unit        TEXT,
    notes       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    is_liquid   INTEGER NOT NULL DEFAULT 0,
    goal_id     TEXT REFERENCES investment_goals(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS investment_transactions (
    id             TEXT PRIMARY KEY,
    investment_id  TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    goal_id        TEXT REFERENCES investment_goals(id) ON DELETE SET NULL,
    type           TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DIVIDEND')),
    quantity       TEXT NOT NULL DEFAULT '1',
    price_per_unit REAL NOT NULL CHECK (price_per_unit > 0),
    total_amount   REAL NOT NULL,
    from_wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    to_wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
    date           TEXT NOT NULL,
    year           INTEGER NOT NULL,
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    is_initial     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS loans (
    id               TEXT PRIMARY KEY,
    user_id          TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type             TEXT NOT NULL CHECK (type IN ('PIUTANG', 'HUTANG')),
    name             TEXT NOT NULL,
    description      TEXT,
    principal_amount REAL NOT NULL CHECK (principal_amount > 0),
    interest_rate    REAL NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
    interest_type    TEXT NOT NULL DEFAULT 'FLAT' CHECK (interest_type IN ('FLAT', 'REDUCING')),
    start_date       TEXT NOT NULL,
    due_date         TEXT,
    wallet_id        TEXT NOT NULL REFERENCES wallets(id),
    status           TEXT NOT NULL DEFAULT 'ONGOING' CHECK (status IN ('ONGOING', 'LUNAS', 'TERLAMBAT')),
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    is_initial       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS loan_payments (
    id             TEXT PRIMARY KEY,
    loan_id        TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    principal_paid REAL NOT NULL CHECK (principal_paid > 0),
    interest_paid  REAL NOT NULL DEFAULT 0 CHECK (interest_paid >= 0),
    total_paid     REAL NOT NULL,
    date           TEXT NOT NULL,
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    is_initial     INTEGER NOT NULL DEFAULT 0
  );
`)

// ── Migrations ───────────────────────────────────────────────────────────────

export function runMigrations() {
  try {
    db.exec(`ALTER TABLE loans ADD COLUMN payment_likelihood TEXT CHECK (payment_likelihood IN ('LANCAR', 'MERAGUKAN', 'MACET'))`)
  } catch { /* column already exists */ }

  try {
    db.exec(`ALTER TABLE investments ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  // Migrate investment_transactions: tambah DIVIDEND ke CHECK constraint
  // SQLite tidak support ALTER COLUMN, jadi recreate table jika perlu
  try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='investment_transactions'").get() as { sql: string } | undefined
    if (row && !row.sql.includes('DIVIDEND')) {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE investment_transactions_new (
            id             TEXT PRIMARY KEY,
            investment_id  TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
            goal_id        TEXT REFERENCES investment_goals(id) ON DELETE SET NULL,
            type           TEXT NOT NULL CHECK (type IN ('BUY', 'SELL', 'DIVIDEND')),
            quantity       TEXT NOT NULL DEFAULT '1',
            price_per_unit REAL NOT NULL CHECK (price_per_unit > 0),
            total_amount   REAL NOT NULL,
            from_wallet_id TEXT REFERENCES wallets(id) ON DELETE SET NULL,
            to_wallet_id   TEXT REFERENCES wallets(id) ON DELETE SET NULL,
            date           TEXT NOT NULL,
            year           INTEGER NOT NULL,
            notes          TEXT,
            created_at     TEXT NOT NULL DEFAULT (datetime('now')),
            is_initial     INTEGER NOT NULL DEFAULT 0
          );
          INSERT INTO investment_transactions_new SELECT * FROM investment_transactions;
          DROP TABLE investment_transactions;
          ALTER TABLE investment_transactions_new RENAME TO investment_transactions;
        `)
      })()
    }
  } catch { /* already migrated */ }

  try {
    db.exec(`ALTER TABLE investments ADD COLUMN closed_at TEXT`)
  } catch { /* column already exists */ }

  // Remove INVESTASI from master income defaults — it should not be a global default
  db.prepare(`DELETE FROM income_categories WHERE name = 'INVESTASI' AND user_id IS NULL AND year IS NULL`).run()
}

runMigrations()

// ── Seed master data ─────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID() }

// Single local user
db.prepare(`INSERT OR IGNORE INTO "user" (id, name, email) VALUES ('local-user', 'TONAS', 'local@tonas.app')`).run()

// Default credentials (INSERT OR IGNORE to be safe against concurrent module loads)
const hasCreds = db.prepare("SELECT 1 FROM credentials LIMIT 1").get()
if (!hasCreds) {
  try {
    db.prepare("INSERT OR IGNORE INTO credentials (username, password_hash) VALUES (?, ?)").run(
      "TONAS",
      bcryptjs.hashSync("12346", 10),
    )
  } catch {
    // Another worker already seeded — OK
  }
}

// Wallet categories
const hasWalletCats = db.prepare("SELECT 1 FROM wallet_categories LIMIT 1").get()
if (!hasWalletCats) {
  const stmt = db.prepare("INSERT INTO wallet_categories (id, name, is_liquid, is_default, sort_order) VALUES (?, ?, ?, 1, ?)")
  stmt.run(uuid(), "TUNAI",      1, 1)
  stmt.run(uuid(), "BANK",       1, 2)
  stmt.run(uuid(), "E-WALLET",   1, 3)
  stmt.run(uuid(), "INVESTASI",  0, 4)
  stmt.run(uuid(), "ASET FISIK", 0, 5)
  stmt.run(uuid(), "KRIPTO",     0, 6)
}

// Default income categories (master, no user) — INVESTASI intentionally excluded
const hasDefaultIncome = db.prepare("SELECT 1 FROM income_categories WHERE is_default = 1 AND user_id IS NULL LIMIT 1").get()
if (!hasDefaultIncome) {
  const stmt = db.prepare("INSERT INTO income_categories (id, name, is_default, sort_order) VALUES (?, ?, 1, ?)")
  stmt.run(uuid(), "TETAP",       1)
  stmt.run(uuid(), "BONUS TETAP", 2)
  stmt.run(uuid(), "FREELANCE",   3)
  stmt.run(uuid(), "LAINNYA",     4)
}

// Default expense types (TETAP, FLEKSIBEL only — MENABUNG removed)
const hasDefaultTypes = db.prepare("SELECT 1 FROM expense_types WHERE is_default = 1 AND user_id IS NULL LIMIT 1").get()
if (!hasDefaultTypes) {
  const tetapId    = uuid()
  const fleksibelId = uuid()
  const typeStmt = db.prepare("INSERT INTO expense_types (id, name, is_default, sort_order) VALUES (?, ?, 1, ?)")
  typeStmt.run(tetapId,     "TETAP",     1)
  typeStmt.run(fleksibelId, "FLEKSIBEL", 2)

  const catStmt = db.prepare("INSERT INTO expense_categories (id, name, type_id, is_default, sort_order, default_percentage) VALUES (?, ?, ?, 1, ?, ?)")
  const tetapCats = [
    ["TRANSPORTASI",     1,  5.27],
    ["RUMAH",            2, 17.80],
    ["PENDIDIKAN",       3,  1.80],
    ["MY LOVE",          4,  2.70],
    ["KESEHATAN",        5,  3.57],
    ["KOMUNIKASI",       6,  3.60],
    ["HIBURAN/JAJAN",    7,  1.80],
    ["HEWAN PELIHARAAN", 8,  0.00],
    ["CICILAN/UTANG",    9,  0.00],
  ] as [string, number, number][]

  for (const [name, sort, pct] of tetapCats) catStmt.run(uuid(), name, tetapId, sort, pct)

  const fleksCats = [
    "GAYA HIDUP", "SOSIAL", "RELATION", "SELF DEVELOPMENT",
    "INVESTASI BISNIS", "KANTOR", "FREELANCE EXPENSE", "DONASI/ZAKAT", "LAINNYA",
  ]
  for (let i = 0; i < fleksCats.length; i++) catStmt.run(uuid(), fleksCats[i], fleksibelId, i + 1, 0)
}

// Default investment categories
const hasInvCats = db.prepare("SELECT 1 FROM investment_categories WHERE is_default = 1 LIMIT 1").get()
if (!hasInvCats) {
  const stmt = db.prepare("INSERT INTO investment_categories (id, name, is_default, sort_order) VALUES (?, ?, 1, ?)")
  const cats = ["SAHAM", "REKSA DANA", "EMAS", "KRIPTO", "DEPOSITO", "LAINNYA"]
  cats.forEach((n, i) => stmt.run(uuid(), n, i + 1))
}
