import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { hasPermission, PERMISSION } from "@/lib/permissions"
import { BaseDataError, MAX_BASE_BYTES, importBaseData, parseBaseData } from "@/lib/base-data"

/** Import base data (upsert per id, tidak menghapus). Hanya Super Admin. */
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.role !== "super_admin" || !hasPermission(session.role, PERMISSION.MONITORING.UPDATE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let text: string
  try {
    const file = (await req.formData()).get("file")
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "File tidak ditemukan dalam request" }, { status: 400 })
    }
    if (file.size > MAX_BASE_BYTES) {
      return NextResponse.json({ error: "File terlalu besar (maks 5 MB)" }, { status: 413 })
    }
    text = await file.text()
  } catch {
    return NextResponse.json({ error: "Request tidak valid" }, { status: 400 })
  }

  try {
    const result = await importBaseData(parseBaseData(text))
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof BaseDataError) return NextResponse.json({ error: err.message }, { status: 400 })
    console.error("[base-data import]", err)
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Gagal import, tidak ada data yang diubah: ${msg}` }, { status: 500 })
  }
}
