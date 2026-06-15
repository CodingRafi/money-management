import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { validateSession } from "@/lib/auth-simple"
import { cookies } from "next/headers"

// Tables with a user_id column — filtered by user
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
  "investments",
  "investment_goals",
  "loans",
] as const

// Tables without user_id that need a JOIN to filter by user
const JOINED_TABLES: { table: string; join: string }[] = [
  {
    table: "investment_transactions",
    join: "JOIN investments i ON investment_transactions.investment_id = i.id WHERE i.user_id = ?",
  },
  {
    table: "loan_payments",
    join: "JOIN loans l ON loan_payments.loan_id = l.id WHERE l.user_id = ?",
  },
]

// Shared master data (no user filter)
const MASTER_TABLES = ["investment_categories"] as const

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

  for (const { table, join } of JOINED_TABLES) {
    const rows = db.prepare(`SELECT ${table}.* FROM ${table} ${join}`).all(userId) as Record<string, unknown>[]
    lines.push(`-- Table: ${table} (${rows.length} rows)`)
    lines.push(tableToInserts(table, rows))
  }

  for (const table of MASTER_TABLES) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]
    lines.push(`-- Table: ${table} (${rows.length} rows)`)
    lines.push(tableToInserts(table, rows))
  }

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
