// Stub — permission system removed in desktop version. All users have all permissions.
export type Role = { id: string; name: string; description: string | null; created_at: Date }
export type Permission = { id: string; codename: string; name: string; created_at: Date }

export async function getUserRoles(_userId: string): Promise<Role[]> { return [] }
export async function getUserPermissions(_userId: string): Promise<string[]> { return [] }
export async function userHasPermission(_userId: string, _codename: string): Promise<boolean> { return true }
export async function userHasAnyPermission(_userId: string, _codenames: string[]): Promise<boolean> { return true }
