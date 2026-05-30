import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { PermissionsProvider } from "@/components/permissions-provider"
import { LicenceBanner } from "@/components/licence-banner"
import { getUserPermissions } from "@/lib/permissions"
import { checkLicenceStatus } from "@/lib/licence"

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const session     = await auth.api.getSession({ headers: headersList })

  if (!session) redirect("/login")

  const permissions = await getUserPermissions(session.user.id).catch((): string[] => [])
  const isAdmin     = permissions.includes("manage_roles")

  // Sinkronisasi status lisensi tiap request (ACTIVE→GRACE→EXPIRED) — admin dilewati
  if (!isAdmin) {
    await checkLicenceStatus(session.user.id).catch(() => {})
  }

  return (
    <div className="min-h-screen bg-background">
      <PermissionsProvider initialPermissions={permissions} />
      <Navbar user={session.user} isAdmin={isAdmin} />
      <LicenceBanner />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
