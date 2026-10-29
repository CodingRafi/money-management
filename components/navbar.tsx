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
import { LogOut, FolderOpen, TrendingUp, LayoutDashboard, Banknote, Settings, Wallet, ShieldCheck, Users } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { logout } from "@/app/actions/session"
import { ContextSwitcher, type ContextOption } from "@/components/context-switcher"

interface NavbarProps {
  username: string
  role: "super_admin" | "admin" | "member" | "child"
  context?: { current: string; options: ContextOption[] } | null
  familyMode?: boolean
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rekap",     label: "Cashflow",  icon: FolderOpen },
  { href: "/dompet",    label: "Dompet",    icon: Wallet },
  { href: "/investasi", label: "Investasi", icon: TrendingUp },
  { href: "/pinjaman",  label: "Pinjaman",  icon: Banknote },
]

const CHILD_LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/saya",      label: "Saya",      icon: Wallet },
]

export function Navbar({ username, role, context, familyMode }: NavbarProps) {
  const pathname = usePathname()
  const router   = useRouter()

  const initials = username.slice(0, 2).toUpperCase()

  const handleSignOut = async () => {
    await logout()
    router.push("/login")
  }

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur ${familyMode ? "border-emerald-700/40 bg-emerald-50/90 dark:bg-emerald-950/40" : "border-border bg-background/95"}`}>
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center shrink-0">
            <Image src="/logo.svg" alt="TONAS" width={90} height={35} />
          </Link>

          <nav className="flex items-center gap-1">
            {(role === "child" ? CHILD_LINKS : NAV_LINKS).map(({ href, label }) => {
              const isActive = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
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
            {role === "super_admin" && (
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/super-admin">
                  <ShieldCheck className="h-4 w-4" />
                  Super Admin
                </Link>
              </DropdownMenuItem>
            )}
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
