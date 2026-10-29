import { licenseService } from "@/services/license.service"

/** Lisensi aktif = keluarga boleh menulis data. Super admin dikecualikan oleh pemanggil. */
export async function canEditHousehold(householdId: string | null): Promise<boolean> {
  if (!householdId) return false
  return (await licenseService.getState(householdId)).ok
}

export async function requireActiveLicence(householdId: string | null): Promise<void> {
  if (!(await canEditHousehold(householdId))) throw new Error("Lisensi tidak aktif")
}
