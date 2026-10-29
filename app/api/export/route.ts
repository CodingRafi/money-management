import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getSession } from "@/lib/session"

// Urutan dump — mengikuti dependensi foreign key (parent ditulis duluan),
// supaya hasil dump bisa langsung di-import ke database kosong.
const DUMP_ORDER: { table: string; userScoped: boolean; join?: string }[] = [
  { table: "wallet_categories", userScoped: false },
  { table: "investment_categories", userScoped: false },
  {
    table: "income_categories",
    userScoped: false,
    join: "JOIN household_members hm ON hm.household_id = income_categories.household_id WHERE hm.user_id = ?",
  },
  {
    table: "expense_types",
    userScoped: false,
    join: "JOIN household_members hm ON hm.household_id = expense_types.household_id WHERE hm.user_id = ?",
  },
  {
    table: "expense_categories",
    userScoped: false,
    join: "JOIN household_members hm ON hm.household_id = expense_categories.household_id WHERE hm.user_id = ?",
  },
  { table: "type_allocations", userScoped: true },
  { table: "budgets", userScoped: true },
  { table: "category_nominal_budgets", userScoped: true },
  { table: "year_budget_settings", userScoped: true },
  { table: "wallets", userScoped: true },
  { table: "investment_goals", userScoped: true },
  { table: "investments", userScoped: true },
  { table: "incomes", userScoped: true },
  { table: "expenses", userScoped: true },
  { table: "transfers", userScoped: true },
  { table: "loans", userScoped: true },
  { table: "loans_given", userScoped: true },
  { table: "loans_taken", userScoped: true },
  {
    table: "investment_transactions",
    userScoped: false,
    join: "JOIN investments i ON investment_transactions.investment_id = i.id WHERE i.user_id = ?",
  },
  {
    table: "loan_payments",
    userScoped: false,
    join: "JOIN loans l ON loan_payments.loan_id = l.id WHERE l.user_id = ?",
  },
]

/**
 * Escape nilai untuk literal Postgres.
 * String selalu ditulis sebagai E'...' supaya newline/backslash tetap aman
 * dan dump bisa diproses per baris.
 */
function escapeSQL(val: unknown): string {
  if (val === null || val === undefined) return "NULL"
  if (typeof val === "number") return String(val)
  if (typeof val === "boolean") return val ? "1" : "0"
  if (val instanceof Date) return `E'${val.toISOString()}'`
  const s = String(val)
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "''")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  return `E'${escaped}'`
}

function tableToInserts(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- (no rows in ${table})\n`
  const cols = Object.keys(rows[0])
  const lines = rows.map((row) => {
    const vals = cols.map((c) => escapeSQL(row[c])).join(", ")
    return `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals}) ON CONFLICT DO NOTHING;`
  })
  return lines.join("\n") + "\n"
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.userId
  const lines: string[] = [
    `-- Money Management SQL Dump (PostgreSQL)`,
    `-- Exported: ${new Date().toISOString()}`,
    `-- User: ${userId}`,
    ``,
  ]

  for (const { table, userScoped, join } of DUMP_ORDER) {
    const rows = (userScoped
      ? await db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).all(userId)
      : join
        ? await db.prepare(`SELECT ${table}.* FROM ${table} ${join}`).all(userId)
        : await db.prepare(`SELECT * FROM ${table}`).all()) as Record<string, unknown>[]
    lines.push(`-- Table: ${table} (${rows.length} rows)`)
    lines.push(tableToInserts(table, rows))
  }

  const dump = lines.join("\n")
  const filename = `money-management-${new Date().toISOString().slice(0, 10)}.sql`

  return new NextResponse(dump, {
    headers: {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
