import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { BackupError, MAX_BACKUP_BYTES, parseBackup, restoreBackup } from "@/lib/household-backup"

/** Import data keluarga (JSON) — menimpa data keluarga. Hanya admin / kepala keluarga. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "admin" || !session.householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let text: string
  try {
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "File tidak ditemukan dalam request" }, { status: 400 })
    }
    if (file.size > MAX_BACKUP_BYTES) {
      return NextResponse.json({ error: "File terlalu besar (maks 20 MB)" }, { status: 413 })
    }
    text = await file.text()
  } catch {
    return NextResponse.json({ error: "Request tidak valid" }, { status: 400 })
  }

  try {
    const backup = parseBackup(text)
    const result = await restoreBackup(session.householdId, backup)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof BackupError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error("[import]", err)
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Gagal import, tidak ada data yang diubah: ${msg}` }, { status: 500 })
  }
}
