import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { validateSession } from "@/lib/auth-simple"
import { cookies } from "next/headers"

// Urutan hapus: child lebih dulu supaya tidak bentrok dengan foreign key.
const DELETE_ORDER = [
  "loan_payments",
  "investment_transactions",
  "loans_taken",
  "loans_given",
  "loans",
  "transfers",
  "expenses",
  "incomes",
  "investments",
  "investment_goals",
  "wallets",
  "budgets",
  "category_nominal_budgets",
  "year_budget_settings",
  "type_allocations",
  "expense_categories",
  "expense_types",
  "income_categories",
  "wallet_categories",
  "investment_categories",
]

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token || !(await validateSession(token))) {
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
    await db.transaction(async () => {
      // Hapus tabel anak lebih dulu
      for (const table of DELETE_ORDER) {
        await db.execRaw(`DELETE FROM ${table}`)
      }

      // Jalankan statement dari dump (satu statement per baris)
      let skipped = 0
      for (const line of sqlText.split("\n")) {
        const stmt = line.trim()
        if (!stmt || stmt.startsWith("--")) continue
        if (/^SET\s+session_replication_role/i.test(stmt)) continue
        const sql = stmt.endsWith(";") ? stmt.slice(0, -1) : stmt
        if (!sql) continue
        try {
          await db.execRaw(sql)
        } catch {
          // Lewati statement yang gagal (mis. tabel belum ada)
          skipped++
        }
      }
      if (skipped > 0) {
        console.warn(`[import] ${skipped} statement dilewati`)
      }
    })

    return NextResponse.json({ success: true, message: "Data berhasil diimport" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Gagal import: ${msg}` }, { status: 500 })
  }
}
