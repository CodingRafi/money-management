"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  LogOut,
  FolderOpen,
  TrendingUp,
  LayoutDashboard,
  Banknote,
  Settings,
  Wallet,
  Users,
  ScrollText,
  Home,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { logout } from "@/app/actions/session"
import { ContextSwitcher, type ContextOption } from "@/components/context-switcher"
import { PERMISSION, hasPermission, type Permission, type UserRole } from "@/lib/permissions"

interface NavbarProps {
  username: string
  role: UserRole
  context?: { current: string; options: ContextOption[] } | null
  familyMode?: boolean
}

interface NavLink {
  href: string
  label: string
  icon: typeof LayoutDashboard
  permission: Permission
  /** Match persis (untuk path root modul). Default: startsWith. */
  exact?: boolean
}

/** Menu aplikasi untuk anggota keluarga (member/admin). */
const NAV_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: PERMISSION.DASHBOARD.VIEW },
  { href: "/rekap", label: "Cashflow", icon: FolderOpen, permission: PERMISSION.CASHFLOW.VIEW },
  { href: "/dompet", label: "Dompet", icon: Wallet, permission: PERMISSION.WALLET.VIEW },
  { href: "/investasi", label: "Investasi", icon: TrendingUp, permission: PERMISSION.INVESTMENT.VIEW },
  { href: "/pinjaman", label: "Pinjaman", icon: Banknote, permission: PERMISSION.LOAN.VIEW },
]

/** Menu khusus Super Admin — hanya menampilkan menu bila ada izin `view`. */
const SUPER_ADMIN_LINKS: NavLink[] = [
  { href: "/super-admin", label: "Monitoring", icon: LayoutDashboard, permission: PERMISSION.MONITORING.VIEW, exact: true },
  { href: "/super-admin/licensi", label: "Lisensi", icon: ScrollText, permission: PERMISSION.LICENSE.VIEW },
  { href: "/super-admin/keluarga", label: "Keluarga", icon: Home, permission: PERMISSION.FAMILY.VIEW },
]

const ADMIN_EXTRA_LINKS: NavLink[] = [
  { href: "/pengaturan/anggota", label: "Anggota", icon: Users, permission: PERMISSION.MEMBER.VIEW },
]

const CHILD_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: PERMISSION.DASHBOARD.VIEW },
  { href: "/saya", label: "Saya", icon: Wallet, permission: PERMISSION.PERSONAL.VIEW },
]

function linksForRole(role: UserRole): NavLink[] {
  if (role === "super_admin") return SUPER_ADMIN_LINKS
  if (role === "child") return CHILD_LINKS
  if (role === "admin") return [...NAV_LINKS, ...ADMIN_EXTRA_LINKS]
  return NAV_LINKS
}

export function Navbar({ username, role, context, familyMode }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const initials = username.slice(0, 2).toUpperCase()

  // Menu muncul bila user punya izin `view` untuk resource-nya.
  const visibleLinks = linksForRole(role).filter((l) => hasPermission(role, l.permission))

  const handleSignOut = async () => {
    await logout()
    router.push("/login")
  }

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur ${familyMode ? "border-emerald-700/40 bg-emerald-50/90 dark:bg-emerald-950/40" : "border-border bg-background/95"}`}>
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href={role === "super_admin" ? "/super-admin" : "/dashboard"} className="flex items-center shrink-0">
            <Image src="/logo.svg" alt="TONAS" width={90} height={35} />
          </Link>

          <nav className="flex items-center gap-1">
            {visibleLinks.map(({ href, label, icon: Icon, exact }) => {
              const isActive = exact ? pathname === href : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
        {context && <ContextSwitcher current={context.current} options={context.options} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm sm:inline-block">{username}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium leading-none">{username}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/settings/account">
                <Settings className="h-4 w-4" />
                Pengaturan Akun
              </Link>
            </DropdownMenuItem>
            {role === "admin" && (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/pengaturan/anggota">
                  <Users className="h-4 w-4" />
                  Anggota Keluarga
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
