import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { hasPermission, PERMISSION } from "@/lib/permissions"
import { buildBaseData } from "@/lib/base-data"

/** Export base data (data referensi global). Hanya Super Admin. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.role !== "super_admin" || !hasPermission(session.role, PERMISSION.MONITORING.VIEW)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = await buildBaseData()
  const filename = `base-data-${new Date().toISOString().slice(0, 10)}.json`
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
