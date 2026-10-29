import type { LicenseRow } from "@/repositories/license.repository"

export type LicenseBlockReason = "expired" | "suspended" | "missing"

export interface LicenseState {
  ok: boolean
  reason?: LicenseBlockReason
  license?: LicenseRow
}

/** Aturan murni: status + tanggal kadaluarsa → boleh pakai aplikasi atau tidak. */
export function evaluateLicense(license: LicenseRow | undefined, now = new Date()): LicenseState {
  if (!license) return { ok: false, reason: "missing" }
  if (license.status === "suspended") return { ok: false, reason: "suspended", license }
  if (license.status === "expired") return { ok: false, reason: "expired", license }
  if (license.expires_at && new Date(license.expires_at) < now) return { ok: false, reason: "expired", license }
  return { ok: true, license }
}
