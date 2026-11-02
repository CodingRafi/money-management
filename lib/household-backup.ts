import { db } from "@/lib/db"

/**
 * Backup & restore data SATU keluarga (household) dalam format JSON.
 *
 * Kenapa JSON, bukan SQL dump: file import berasal dari pengguna. Menjalankan
 * SQL mentah dari file = admin satu keluarga bisa menulis/menghapus data
 * keluarga lain. Di sini setiap baris divalidasi: kolom dibatasi ke kolom
 * tabel yang nyata, `household_id` dipaksa ke keluarga si admin, dan `user_id`
 * wajib anggota keluarga yang sama.
 *
 * Akun anggota (termasuk hash password) ikut di file supaya bisa dipindah ke
 * instalasi lain. Saat import akun TIDAK menimpa akun yang sudah ada:
 *   - anggota yang sudah ada (id sama, atau username sama) dipakai apa adanya;
 *   - anggota yang belum ada dibuat hanya jika kuota lisensi cukup, role-nya
 *     dipaksa member/child (tidak pernah admin/super_admin), dan id/username/
 *     email belum dipakai akun lain.
 *
 * Yang TIDAK ikut: keluarga, lisensi, tautan Telegram, dan tabel referensi
 * global (wallet_categories, investment_categories).
 */

export const BACKUP_FORMAT = "money-management-backup"
export const BACKUP_VERSION = 3
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024

type Scope =
  | { kind: "household" }
  | { kind: "user" }
  | { kind: "parent"; fk: string; parent: string }

/** Urutan = dependensi foreign key (parent dulu). Hapus memakai urutan terbalik. */
const TABLES: { table: string; scope: Scope }[] = [
  { table: "income_categories", scope: { kind: "household" } },
  { table: "expense_types", scope: { kind: "household" } },
  { table: "expense_categories", scope: { kind: "household" } },
  { table: "type_allocations", scope: { kind: "user" } },
  { table: "budgets", scope: { kind: "user" } },
  { table: "category_nominal_budgets", scope: { kind: "user" } },
  { table: "year_budget_settings", scope: { kind: "user" } },
  { table: "wallets", scope: { kind: "user" } },
  { table: "investment_goals", scope: { kind: "user" } },
  { table: "investments", scope: { kind: "user" } },
  { table: "investment_transactions", scope: { kind: "parent", fk: "investment_id", parent: "investments" } },
  { table: "incomes", scope: { kind: "user" } },
  { table: "expenses", scope: { kind: "user" } },
  { table: "transfers", scope: { kind: "user" } },
  { table: "loans", scope: { kind: "user" } },
  { table: "loan_payments", scope: { kind: "parent", fk: "loan_id", parent: "loans" } },
  { table: "loans_given", scope: { kind: "user" } },
  { table: "loans_taken", scope: { kind: "user" } },
  { table: "fundamental_analyses", scope: { kind: "user" } },
]

export type BackupFile = {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  householdId: string
  accounts?: {
    users: Record<string, unknown>[]
    members: Record<string, unknown>[]
  }
  tables: Record<string, Record<string, unknown>[]>
}

type Row = Record<string, unknown>

async function memberIds(householdId: string): Promise<string[]> {
  const rows = (await db
    .prepare(`SELECT user_id FROM household_members WHERE household_id = ?`)
    .all(householdId)) as { user_id: string }[]
  return rows.map((r) => r.user_id)
}

/** Kolom nyata tiap tabel; tabel yang tidak ada (mis. sudah di-drop) → kosong. */
async function loadColumns(): Promise<Map<string, Set<string>>> {
  const rows = (await db
    .prepare(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = ANY(?)`,
    )
    .all(TABLES.map((t) => t.table))) as { table_name: string; column_name: string }[]
  const map = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!map.has(r.table_name)) map.set(r.table_name, new Set())
    map.get(r.table_name)!.add(r.column_name)
  }
  return map
}

// ── Export ──────────────────────────────────────────────────────────────────

export async function buildBackup(householdId: string): Promise<BackupFile> {
  const members = await memberIds(householdId)
  const columns = await loadColumns()
  const tables: BackupFile["tables"] = {}

  for (const { table, scope } of TABLES) {
    if (!columns.has(table)) continue
    let rows: Row[]
    if (scope.kind === "household") {
      rows = await db.prepare(`SELECT * FROM ${table} WHERE household_id = ?`).all(householdId)
    } else if (scope.kind === "user") {
      rows = await db.prepare(`SELECT * FROM ${table} WHERE user_id = ANY(?)`).all(members)
    } else {
      rows = await db
        .prepare(
          `SELECT * FROM ${table} WHERE ${scope.fk} IN (SELECT id FROM ${scope.parent} WHERE user_id = ANY(?))`,
        )
        .all(members)
    }
    tables[table] = rows
  }

  const users = await db
    .prepare(
      `SELECT id, name, email, username, password_hash, relation FROM "user" WHERE id = ANY(?) ORDER BY created_at`,
    )
    .all(members)
  const memberRows = await db
    .prepare(
      `SELECT user_id, role, relation, spending_limit FROM household_members WHERE household_id = ?`,
    )
    .all(householdId)

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    householdId,
    accounts: { users, members: memberRows },
    tables,
  }
}

// ── Import ──────────────────────────────────────────────────────────────────

export class BackupError extends Error {}

export function parseBackup(text: string): BackupFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("File bukan JSON yang valid. Gunakan file hasil Export dari aplikasi ini.")
  }
  const f = data as Partial<BackupFile> | null
  if (!f || f.format !== BACKUP_FORMAT || typeof f.tables !== "object" || f.tables === null) {
    throw new BackupError("Format file tidak dikenali. Gunakan file hasil Export dari aplikasi ini.")
  }
  if (typeof f.version !== "number" || f.version > BACKUP_VERSION) {
    throw new BackupError("Versi file backup tidak didukung.")
  }
  return f as BackupFile
}

export type ImportResult = { rows: number; skipped: number; accountsCreated: number }

/**
 * Petakan akun di file → akun di keluarga ini (membuat yang belum ada bila
 * kuota lisensi cukup). Mengembalikan peta id lama → id sekarang.
 */
async function resolveAccounts(
  householdId: string,
  backup: BackupFile,
  current: string[],
): Promise<{ idMap: Map<string, string>; created: number }> {
  const idMap = new Map<string, string>()
  let created = 0

  const currentUsers = current.length
    ? ((await db
        .prepare(`SELECT id, username FROM "user" WHERE id = ANY(?)`)
        .all(current)) as { id: string; username: string | null }[])
    : []
  const byId = new Set(currentUsers.map((u) => u.id))
  const byUsername = new Map(
    currentUsers.filter((u) => u.username).map((u) => [u.username!.toLowerCase(), u.id]),
  )

  const lic = (await db
    .prepare(`SELECT max_members FROM licenses WHERE household_id = ?`)
    .get(householdId)) as { max_members: number } | undefined
  const quota = lic?.max_members ?? current.length
  let count = current.length

  const memberMeta = new Map<string, Record<string, unknown>>()
  for (const m of backup.accounts?.members ?? []) memberMeta.set(String(m.user_id), m)

  for (const u of backup.accounts?.users ?? []) {
    const oldId = String(u.id ?? "")
    const username = typeof u.username === "string" ? u.username : ""
    if (!oldId) continue

    if (byId.has(oldId)) {
      idMap.set(oldId, oldId)
      continue
    }
    const sameName = username ? byUsername.get(username.toLowerCase()) : undefined
    if (sameName) {
      idMap.set(oldId, sameName)
      continue
    }

    // Akun baru: validasi ketat.
    if (count >= quota) continue
    if (!username || typeof u.password_hash !== "string" || typeof u.name !== "string" || typeof u.email !== "string") continue
    const clash = await db
      .prepare(`SELECT 1 AS x FROM "user" WHERE id = ? OR lower(username) = lower(?) OR lower(email) = lower(?)`)
      .get(oldId, username, u.email)
    if (clash) continue

    const meta = memberMeta.get(oldId)
    const role = meta?.role === "child" ? "child" : "member"
    const relation = typeof meta?.relation === "string" ? meta.relation : typeof u.relation === "string" ? u.relation : null
    const limit = typeof meta?.spending_limit === "number" ? meta.spending_limit : null

    await db
      .prepare(`INSERT INTO "user" (id, name, email, username, password_hash, relation, role) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(oldId, u.name, u.email, username, u.password_hash, relation, role)
    await db
      .prepare(`INSERT INTO household_members (household_id, user_id, role, relation, spending_limit) VALUES (?, ?, ?, ?, ?)`)
      .run(householdId, oldId, role, relation, limit)
    idMap.set(oldId, oldId)
    count++
    created++
  }
  return { idMap, created }
}

/** Ganti seluruh data keluarga dengan isi backup. Atomik: gagal → tidak ada yang berubah. */
export async function restoreBackup(householdId: string, backup: BackupFile): Promise<ImportResult> {
  const members = await memberIds(householdId)
  const columns = await loadColumns()
  let inserted = 0
  let skipped = 0
  let accountsCreated = 0

  await db.transaction(async () => {
    // 0. Akun anggota (buat yang belum ada) + peta id.
    const { idMap, created } = await resolveAccounts(householdId, backup, members)
    accountsCreated = created
    // Backup lama (v2) tanpa akun: id user di file diasumsikan sama dengan sekarang.
    if (!backup.accounts) for (const id of members) idMap.set(id, id)

    // 1. Hapus data lama keluarga ini (child dulu).
    for (const { table, scope } of [...TABLES].reverse()) {
      if (!columns.has(table)) continue
      if (scope.kind === "household") {
        await db.prepare(`DELETE FROM ${table} WHERE household_id = ?`).run(householdId)
      } else if (scope.kind === "user") {
        await db.prepare(`DELETE FROM ${table} WHERE user_id = ANY(?)`).run(members)
      } else {
        await db
          .prepare(
            `DELETE FROM ${table} WHERE ${scope.fk} IN (SELECT id FROM ${scope.parent} WHERE user_id = ANY(?))`,
          )
          .run(members)
      }
    }

    // 2. Masukkan baris dari file (parent dulu). INSERT biasa, TANPA ON CONFLICT:
    //    id yang bentrok dengan keluarga lain harus menggagalkan import, bukan
    //    diam-diam menautkan data ke baris milik orang lain.
    for (const { table, scope } of TABLES) {
      const cols = columns.get(table)
      const rows = backup.tables[table]
      if (!cols || !Array.isArray(rows)) continue

      for (const raw of rows) {
        if (!raw || typeof raw !== "object") {
          skipped++
          continue
        }
        const row: Row = {}
        for (const [k, v] of Object.entries(raw)) {
          if (cols.has(k)) row[k] = v
        }

        if (scope.kind === "household") row.household_id = householdId
        if (scope.kind === "user") {
          const target = idMap.get(String(row.user_id))
          if (!target) {
            skipped++
            continue
          }
          row.user_id = target
        }
        // Penginput yang bukan anggota keluarga ini → kosongkan, jangan tautkan akun asing.
        if ("recorded_by" in row && row.recorded_by != null) {
          row.recorded_by = idMap.get(String(row.recorded_by)) ?? null
        }

        const keys = Object.keys(row)
        if (keys.length === 0) {
          skipped++
          continue
        }
        const colList = keys.map((k) => `"${k}"`).join(", ")
        const placeholders = keys.map(() => "?").join(", ")
        await db
          .prepare(`INSERT INTO ${table} (${colList}) VALUES (${placeholders})`)
          .run(...keys.map((k) => row[k]))
        inserted++
      }
    }
  })

  return { rows: inserted, skipped, accountsCreated }
}
