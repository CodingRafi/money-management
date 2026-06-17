import { NextRequest, NextResponse } from "next/server"
import { db, runMigrations } from "@/lib/db"
import { validateSession } from "@/lib/auth-simple"
import { cookies } from "next/headers"

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const contentType = req.headers.get("content-type") ?? ""
  let sqlText: string

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "File tidak ditemukan dalam request" }, { status: 400 })
    }
    sqlText = await (file as Blob).text()
  } else {
    sqlText = await req.text()
  }

  if (!sqlText.trim()) {
    return NextResponse.json({ error: "File SQL kosong" }, { status: 400 })
  }

  try {
    // Must be outside the transaction — SQLite silently ignores PRAGMA foreign_keys inside a transaction
    db.exec("PRAGMA foreign_keys = OFF")

    db.transaction(() => {
      // Delete child tables first (no user_id — joined via parent)
      db.exec("DELETE FROM loan_payments")
      db.exec("DELETE FROM investment_transactions")
      // Delete all user-owned tables
      db.exec("DELETE FROM loans_given")
      db.exec("DELETE FROM loans_taken")
      db.exec("DELETE FROM loans")
      db.exec("DELETE FROM investment_goals")
      db.exec("DELETE FROM investments")
      db.exec("DELETE FROM transfers")
      db.exec("DELETE FROM expenses")
      db.exec("DELETE FROM incomes")
      db.exec("DELETE FROM budgets")
      db.exec("DELETE FROM type_allocations")
      db.exec("DELETE FROM expense_categories")
      db.exec("DELETE FROM expense_types")
      db.exec("DELETE FROM income_categories")
      db.exec("DELETE FROM wallets")
      // Master tables
      db.exec("DELETE FROM wallet_categories")
      db.exec("DELETE FROM investment_categories")

      // Insert from SQL dump
      for (const line of sqlText.split("\n")) {
        const stmt = line.trim()
        if (!stmt || stmt.startsWith("--") || stmt.toUpperCase().startsWith("PRAGMA")) continue
        const sql = stmt.endsWith(";") ? stmt.slice(0, -1) : stmt
        if (!sql) continue
        try {
          db.prepare(sql).run()
        } catch {
          // Skip statements that fail (e.g. table doesn't exist yet)
        }
      }
    })()

    db.exec("PRAGMA foreign_keys = ON")

    runMigrations()

    return NextResponse.json({ success: true, message: "Data berhasil diimport" })
  } catch (err) {
    db.exec("PRAGMA foreign_keys = ON")
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Gagal import: ${msg}` }, { status: 500 })
  }
}
