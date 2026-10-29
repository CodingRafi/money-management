import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

/** Info koneksi database (tanpa password) untuk ditampilkan di halaman pengaturan. */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Import menimpa seluruh tabel dan db-info membuka host DB: hanya pemilik SaaS.
  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    return NextResponse.json({ error: "DATABASE_URL belum diset" }, { status: 500 })
  }

  let parsed: URL | null = null
  try {
    parsed = new URL(url)
  } catch {
    /* URL tidak valid */
  }

  return NextResponse.json({
    host: parsed?.hostname ?? "",
    port: parsed?.port || "5432",
    database: parsed?.pathname?.replace(/^\//, "") ?? "",
    user: parsed?.username ?? "",
    driver: "PostgreSQL",
  })
}
