/**
 * SATU-SATUNYA sumber kebenaran permission aplikasi.
 *
 * - Setiap resource punya 4 aksi: view, create, update, delete.
 * - Role diambil dari kolom `role` pada tabel "user".
 * - `view` → data ditampilkan DAN menu di navbar muncul.
 *   `create/update/delete` → tombol aksi (form tambah, edit, hapus) muncul.
 * - Modul ini WAJIB bebas dari dependensi server (db, next/*) supaya bisa
 *   dipakai di Server Component maupun Client Component.
 */

export type UserRole = "super_admin" | "admin" | "member" | "child"

export const ACTION = {
  VIEW: "view",
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
} as const
export type Action = (typeof ACTION)[keyof typeof ACTION]
/** Nama key aksi: "VIEW" | "CREATE" | "UPDATE" | "DELETE". */
export type ActionKey = keyof typeof ACTION

export const RESOURCE = {
  // ── Modul Super Admin ────────────────────────────────────────────────────
  MONITORING: "monitoring",
  LICENSE: "license",
  FAMILY: "family",
  MEMBER: "member",
  // ── Modul Aplikasi Keluarga ──────────────────────────────────────────────
  DASHBOARD: "dashboard",
  CASHFLOW: "cashflow",
  WALLET: "wallet",
  INVESTMENT: "investment",
  LOAN: "loan",
  PERSONAL: "personal",
  SETTINGS: "settings",
} as const
export type Resource = (typeof RESOURCE)[keyof typeof RESOURCE]

/** Format: "<resource>.<action>" — contoh: "license.update". */
export type Permission = `${Resource}.${Action}`

/**
 * Daftar permission per resource. Satu blok per resource agar mudah dibaca
 * dan menambah resource baru cukup satu blok di sini.
 */
export const PERMISSION = {
  MONITORING: {
    VIEW: "monitoring.view",
    CREATE: "monitoring.create",
    UPDATE: "monitoring.update",
    DELETE: "monitoring.delete",
  },
  LICENSE: {
    VIEW: "license.view",
    CREATE: "license.create",
    UPDATE: "license.update",
    DELETE: "license.delete",
  },
  FAMILY: {
    VIEW: "family.view",
    CREATE: "family.create",
    UPDATE: "family.update",
    DELETE: "family.delete",
  },
  MEMBER: {
    VIEW: "member.view",
    CREATE: "member.create",
    UPDATE: "member.update",
    DELETE: "member.delete",
  },
  DASHBOARD: {
    VIEW: "dashboard.view",
    CREATE: "dashboard.create",
    UPDATE: "dashboard.update",
    DELETE: "dashboard.delete",
  },
  CASHFLOW: {
    VIEW: "cashflow.view",
    CREATE: "cashflow.create",
    UPDATE: "cashflow.update",
    DELETE: "cashflow.delete",
  },
  WALLET: {
    VIEW: "wallet.view",
    CREATE: "wallet.create",
    UPDATE: "wallet.update",
    DELETE: "wallet.delete",
  },
  INVESTMENT: {
    VIEW: "investment.view",
    CREATE: "investment.create",
    UPDATE: "investment.update",
    DELETE: "investment.delete",
  },
  LOAN: {
    VIEW: "loan.view",
    CREATE: "loan.create",
    UPDATE: "loan.update",
    DELETE: "loan.delete",
  },
  PERSONAL: {
    VIEW: "personal.view",
    CREATE: "personal.create",
    UPDATE: "personal.update",
    DELETE: "personal.delete",
  },
  SETTINGS: {
    VIEW: "settings.view",
    CREATE: "settings.create",
    UPDATE: "settings.update",
    DELETE: "settings.delete",
  },
} as const satisfies Record<string, Record<ActionKey, Permission>>

// ── Helper penyusun daftar permission ───────────────────────────────────────

const ALL_ACTIONS: readonly Action[] = [ACTION.VIEW, ACTION.CREATE, ACTION.UPDATE, ACTION.DELETE]

function allActions(resource: Resource): Permission[] {
  return ALL_ACTIONS.map((a) => `${resource}.${a}` as Permission)
}

function viewOnly(resources: readonly Resource[]): Permission[] {
  return resources.map((r) => `${r}.${ACTION.VIEW}` as Permission)
}

// ── Pemetaan Role → Permission ──────────────────────────────────────────────

/**
 * `super_admin` = pengelola SaaS: akses penuh ke semua modul.
 * `admin`      = kepala keluarga: kelola data & anggota keluarga sendiri.
 * `member`     = anggota dewasa: hanya bisa melihat data.
 * `child`      = anak: hanya dashboard & halaman pribadinya.
 *
 * CATATAN: resource `monitoring`, `license`, dan `family` KHUSUS super_admin.
 * Kalau Family Admin ikut memegangnya, ia bisa membuka lisensi & anggota
 * keluarga lain (bocor lintas keluarga). Modul "keluarga & anggota" milik
 * Family Admin memakai resource `member` dengan cakupan household-nya sendiri.
 *
 * `member.create` TIDAK diberikan ke `admin` (kepala keluarga): pembuatan akun
 * anggota & pemakaian kuota lisensi adalah kewenangan Super Admin. Kepala
 * keluarga hanya melihat & mengelola anggota yang sudah terdaftar.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  super_admin: Object.values(RESOURCE).flatMap(allActions),
  admin: [
    ...viewOnly([
      RESOURCE.DASHBOARD,
      RESOURCE.CASHFLOW,
      RESOURCE.WALLET,
      RESOURCE.INVESTMENT,
      RESOURCE.LOAN,
      RESOURCE.PERSONAL,
      RESOURCE.SETTINGS,
    ]),
    PERMISSION.MEMBER.VIEW,
    PERMISSION.MEMBER.UPDATE,
    PERMISSION.MEMBER.DELETE,
  ],
  member: viewOnly([
    RESOURCE.DASHBOARD,
    RESOURCE.CASHFLOW,
    RESOURCE.WALLET,
    RESOURCE.INVESTMENT,
    RESOURCE.LOAN,
    RESOURCE.PERSONAL,
    RESOURCE.SETTINGS,
  ]),
  child: viewOnly([RESOURCE.DASHBOARD, RESOURCE.WALLET, RESOURCE.PERSONAL, RESOURCE.SETTINGS]),
}

// ── Cek permission ──────────────────────────────────────────────────────────

export function permissionsForRole(role: UserRole | null | undefined): Permission[] {
  if (!role) return []
  return [...(ROLE_PERMISSIONS[role] ?? [])]
}

export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function hasAnyPermission(
  role: UserRole | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

export function hasAllPermissions(
  role: UserRole | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((p) => hasPermission(role, p))
}

export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "super_admin"
}
