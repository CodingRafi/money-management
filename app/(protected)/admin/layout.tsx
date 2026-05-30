import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { userHasPermission } from "@/lib/permissions"
import Link from "next/link"
import { LayoutDashboard, Shield, Key, Users } from "lucide-react"

const navItems = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/roles", label: "Roles", icon: Shield },
  { href: "/admin/permissions", label: "Permissions", icon: Key },
  { href: "/admin/users", label: "Users", icon: Users },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const isAdmin = await userHasPermission(session.user.id, "manage_roles").catch(() => false)
  if (!isAdmin) redirect("/")

  return (
    <div className="flex gap-8">
      <nav className="w-44 shrink-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin
        </p>
        <div className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
