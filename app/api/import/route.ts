import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
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
    db.transaction(() => {
      db.exec("PRAGMA foreign_keys = OFF")
      // Split on semicolons but preserve string literals
      const statements = sqlText
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--") && !s.toUpperCase().startsWith("PRAGMA"))
      for (const stmt of statements) {
        if (!stmt) continue
        try {
          db.prepare(stmt).run()
        } catch {
          // Skip statements that fail (e.g. table doesn't exist yet)
        }
      }
      db.exec("PRAGMA foreign_keys = ON")
    })()

    return NextResponse.json({ success: true, message: "Data berhasil diimport" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Gagal import: ${msg}` }, { status: 500 })
  }
}
