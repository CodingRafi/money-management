import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { NextRequest, NextResponse } from "next/server"

const DEFAULT_PERMISSIONS = [
  { codename: "manage_roles", name: "Can manage roles" },
  { codename: "manage_permissions", name: "Can manage permissions" },
  { codename: "manage_users", name: "Can manage user roles" },
  { codename: "view_dashboard", name: "Can view dashboard" },
  { codename: "view_transactions", name: "Can view transactions" },
  { codename: "add_transaction", name: "Can add transactions" },
  { codename: "change_transaction", name: "Can edit transactions" },
  { codename: "delete_transaction", name: "Can delete transactions" },
  { codename: "view_reports", name: "Can view reports" },
  { codename: "manage_categories", name: "Can manage categories" },
]

const BASIC_PERMISSIONS = [
  "view_dashboard",
  "view_transactions",
  "add_transaction",
  "change_transaction",
  "view_reports",
]

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codename TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
        permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE,
        role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id)
      )
    `)

    for (const perm of DEFAULT_PERMISSIONS) {
      await client.query(
        `INSERT INTO permissions (codename, name) VALUES ($1, $2) ON CONFLICT (codename) DO NOTHING`,
        [perm.codename, perm.name],
      )
    }

    // admin role — all permissions
    const adminResult = await client.query<{ id: string }>(
      `INSERT INTO roles (name, description)
       VALUES ('admin', 'Administrator with full access')
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
    )
    const adminRoleId = adminResult.rows[0].id
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions ON CONFLICT DO NOTHING`,
      [adminRoleId],
    )

    // user role — basic permissions
    const userResult = await client.query<{ id: string }>(
      `INSERT INTO roles (name, description)
       VALUES ('user', 'Regular user with basic access')
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
    )
    const userRoleId = userResult.rows[0].id
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, id FROM permissions WHERE codename = ANY($2)
       ON CONFLICT DO NOTHING`,
      [userRoleId, BASIC_PERMISSIONS],
    )

    // assign admin role to the calling user
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [session.user.id, adminRoleId],
    )

    await client.query("COMMIT")
    return NextResponse.json({
      success: true,
      message: "Setup complete. Admin role assigned to your account.",
    })
  } catch (error) {
    await client.query("ROLLBACK")
    console.error("Setup error:", error)
    return NextResponse.json({ error: "Setup failed", detail: String(error) }, { status: 500 })
  } finally {
    client.release()
  }
}
