import { NextResponse } from "next/server"
import { validateSession } from "@/lib/auth-simple"
import { cookies } from "next/headers"
import path from "path"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const DATA_DIR = process.env.DATA_DIR ?? process.cwd()
  const dbPath = process.env.DB_PATH ?? path.join(DATA_DIR, "money-management.db")

  return NextResponse.json({ path: dbPath })
}
