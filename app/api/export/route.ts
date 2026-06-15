import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { validateSession } from "@/lib/auth-simple"
import { cookies } from "next/headers"

const USER_TABLES = [
  "wallets",
  "income_categories",
  "expense_types",
  "expense_categories",
  "type_allocations",
  "budgets",
  "incomes",
  "expenses",
  "transfers",
  "investment_categories",
  "investments",
  "investment_goals",
  "investment_transactions",
  "loans",
  "loan_payments",
  "cashflows",
] as const

function escapeSQL(val: unknown): string {
  if (val === null || val === undefined) return "NULL"
  if (typeof val === "number") return String(val)
  if (typeof val === "string") {
    return `'${val.replace(/'/g, "''")}'`
  }
  return `'${String(val).replace(/'/g, "''")}'`
}

function tableToInserts(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- (no rows in ${table})\n`
  const cols = Object.keys(rows[0])
  const lines = rows.map((row) => {
    const vals = cols.map((c) => escapeSQL(row[c])).join(", ")
    return `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${vals});`
  })
  return lines.join("\n") + "\n"
}

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = LOCAL_USER_ID
  const lines: string[] = [
    `-- Money Management SQL Dump`,
    `-- Exported: ${new Date().toISOString()}`,
    `-- User: ${userId}`,
    ``,
    `PRAGMA foreign_keys = OFF;`,
    ``,
  ]

  for (const table of USER_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).all(userId) as Record<string, unknown>[]
    lines.push(`-- Table: ${table} (${rows.length} rows)`)
    lines.push(tableToInserts(table, rows))
  }

  // Export app_settings (no user_id column)
  const settings = db.prepare("SELECT * FROM app_settings").all() as Record<string, unknown>[]
  lines.push(`-- Table: app_settings`)
  lines.push(tableToInserts("app_settings", settings))

  lines.push(`PRAGMA foreign_keys = ON;`)

  const dump = lines.join("\n")
  const filename = `money-management-${new Date().toISOString().slice(0, 10)}.sql`

  return new NextResponse(dump, {
    headers: {
      "Content-Type": "application/sql",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
