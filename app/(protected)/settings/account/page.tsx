import { requireSession } from "@/lib/session"
import { AccountSettings } from "./_components/account-settings"

export default async function AccountSettingsPage() {
  const session = await requireSession()
  // Export & Import hanya untuk admin (kepala keluarga).
  const canBackup = session.role === "admin" && !!session.householdId
  return <AccountSettings canBackup={canBackup} />
}
