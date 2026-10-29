"use client"

import { hasAnyPermission, hasPermission, type Permission, type UserRole } from "@/lib/permissions"

interface PermissionGateProps {
  /** Role user yang sedang login (dari tabel "user"). */
  role: UserRole
  /** Izin tunggal yang harus dimiliki. */
  permission?: Permission
  /** Salah satu dari izin berikut cukup. */
  anyOf?: Permission[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

/**
 * Menampilkan children hanya bila user punya izin yang diminta.
 * `view` → data & menu; `create/update/delete` → tombol aksi.
 */
export function PermissionGate({
  role,
  permission,
  anyOf,
  children,
  fallback = null,
}: PermissionGateProps) {
  const allowed = permission
    ? hasPermission(role, permission)
    : hasAnyPermission(role, anyOf ?? [])

  return <>{allowed ? children : fallback}</>
}
