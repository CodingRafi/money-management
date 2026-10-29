import { NextResponse } from "next/server"
import { validateSession } from "@/lib/auth-simple"
import { cookies } from "next/headers"

/** Info koneksi database (tanpa password) untuk ditampilkan di halaman pengaturan. */
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token || !(await validateSession(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
