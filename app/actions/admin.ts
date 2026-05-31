"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { pool } from "@/lib/db"
import { userHasPermission } from "@/lib/permissions"

async function requireAdmin(permission = "manage_roles") {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error("Unauthenticated")
  const ok = await userHasPermission(session.user.id, permission)
  if (!ok) throw new Error("Unauthorized")
  return session
}

// ── Roles ──────────────────────────────────────────────────────────────────

export async function createRole(formData: FormData) {
  await requireAdmin("manage_roles")
  const name = (formData.get("name") as string)?.trim()
  const description = (formData.get("description") as string)?.trim() || null
  if (!name) throw new Error("Name is required")
  await pool.query(`INSERT INTO roles (name, description) VALUES ($1, $2)`, [name, description])
  revalidatePath("/admin/roles")
}

export async function deleteRole(roleId: string) {
  await requireAdmin("manage_roles")
  await pool.query(`DELETE FROM roles WHERE id = $1`, [roleId])
  revalidatePath("/admin/roles")
}

// ── Role ↔ Permission ──────────────────────────────────────────────────────

export async function addPermissionToRole(roleId: string, permissionId: string) {
  await requireAdmin("manage_permissions")
  await pool.query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [roleId, permissionId],
  )
  revalidatePath(`/admin/roles/${roleId}`)
}

export async function removePermissionFromRole(roleId: string, permissionId: string) {
  await requireAdmin("manage_permissions")
  await pool.query(
    `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2`,
    [roleId, permissionId],
  )
  revalidatePath(`/admin/roles/${roleId}`)
}

// ── Permissions ────────────────────────────────────────────────────────────

export async function createPermission(formData: FormData) {
  await requireAdmin("manage_permissions")
  const codename = (formData.get("codename") as string)?.trim()
  const name = (formData.get("name") as string)?.trim()
  if (!codename || !name) throw new Error("Codename and name are required")
  await pool.query(`INSERT INTO permissions (codename, name) VALUES ($1, $2)`, [codename, name])
  revalidatePath("/admin/permissions")
}

export async function deletePermission(permissionId: string) {
  await requireAdmin("manage_permissions")
  await pool.query(`DELETE FROM permissions WHERE id = $1`, [permissionId])
  revalidatePath("/admin/permissions")
}

// ── User ↔ Role ────────────────────────────────────────────────────────────

export async function assignRoleToUser(userId: string, roleId: string) {
  await requireAdmin("manage_users")
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, roleId],
  )
  revalidatePath("/admin/users")
}

export async function removeRoleFromUser(userId: string, roleId: string) {
  await requireAdmin("manage_users")
  await pool.query(`DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2`, [userId, roleId])
  revalidatePath("/admin/users")
}
