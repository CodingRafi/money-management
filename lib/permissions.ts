import { pool } from "./db"

export type Role = {
  id: string
  name: string
  description: string | null
  created_at: Date
}

export type Permission = {
  id: string
  codename: string
  name: string
  created_at: Date
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const { rows } = await pool.query<Role>(
    `SELECT r.id, r.name, r.description, r.created_at
     FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1
     ORDER BY r.name`,
    [userId],
  )
  return rows
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ codename: string }>(
    `SELECT DISTINCT p.codename
     FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = $1`,
    [userId],
  )
  return rows.map((r) => r.codename)
}

export async function userHasPermission(userId: string, codename: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1 AND p.codename = $2
     ) AS exists`,
    [userId, codename],
  )
  return rows[0]?.exists ?? false
}

export async function userHasAnyPermission(userId: string, codenames: string[]): Promise<boolean> {
  if (codenames.length === 0) return false
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1 AND p.codename = ANY($2)
     ) AS exists`,
    [userId, codenames],
  )
  return rows[0]?.exists ?? false
}
