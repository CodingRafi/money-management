import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { buildBackup } from "@/lib/household-backup"

/** Export data keluarga (JSON). Hanya admin / kepala keluarga. */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (session.role !== "admin" || !session.householdId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const backup = await buildBackup(session.householdId)
  const filename = `money-management-${new Date().toISOString().slice(0, 10)}.json`

  return new NextResponse(JSON.stringify(backup), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
