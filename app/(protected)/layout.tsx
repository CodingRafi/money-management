import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { PermissionsProvider } from "@/components/permissions-provider"
import { getUserPermissions } from "@/lib/permissions"

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    redirect("/login")
  }

  const permissions = await getUserPermissions(session.user.id).catch((): string[] => [])
  const isAdmin = permissions.includes("manage_roles")

  return (
    <div className="min-h-screen bg-background">
      {/* Inject server-fetched permissions into Jotai atom — no client DB call */}
      <PermissionsProvider initialPermissions={permissions} />
      <Navbar user={session.user} isAdmin={isAdmin} />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
