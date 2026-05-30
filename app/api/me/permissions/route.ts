import { auth } from "@/lib/auth"
import { getUserPermissions } from "@/lib/permissions"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) return NextResponse.json({ permissions: [] })

  const permissions = await getUserPermissions(session.user.id).catch(() => [])
  return NextResponse.json({ permissions })
}
