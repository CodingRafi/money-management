import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { LicenceBanner } from "@/components/licence-banner"
import { checkLicenceStatus } from "@/lib/licence"

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const session     = await auth.api.getSession({ headers: headersList })

  if (!session) redirect("/login")

  await checkLicenceStatus(session.user.id).catch(() => {})

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={session.user} />
      <LicenceBanner />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
