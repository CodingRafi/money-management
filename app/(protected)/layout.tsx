import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/login")

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session.username} />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
