import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { permissionsForRole } from "@/lib/permissions"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ permissions: [], role: null })
  return NextResponse.json({
    role: session.role,
    permissions: permissionsForRole(session.role),
  })
}
