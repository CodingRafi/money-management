import { getSession } from "@/lib/session"
import { resolveScope } from "@/lib/scope"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { licenseService } from "@/services/license.service"
import { headers } from "next/headers"
import type { ContextOption } from "@/components/context-switcher"

/**
 * Rute yang boleh dibuka Super Admin.
 *
 * Super Admin = pengelola SaaS, bukan anggota keluarga. Ia tidak boleh
 * membuka halaman data keluarga (/dashboard, /rekap, /dompet, /investasi,
 * /pinjaman, /saya, ...). Yang boleh: portal Super Admin + pengaturan akun
 * miliknya sendiri.
 */
const SUPER_ADMIN_ALLOWED = ["/super-admin", "/settings/account", "/settings/devices"]

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/login")

  const pathname = (await headers()).get("x-pathname") ?? ""

  // Super admin tidak terikat lisensi; user lain wajib punya lisensi keluarga aktif.
  if (session.role !== "super_admin") {
    const state = session.householdId ? await licenseService.getState(session.householdId) : { ok: false }
    if (!state.ok) redirect("/license-expired")
  } else {
    const allowed = SUPER_ADMIN_ALLOWED.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    )
    if (!allowed) redirect("/super-admin")
  }

  // Anak hanya boleh /dashboard, /saya dan pengaturan akun (dicek di server).
  if (session.householdRole === "child") {
    const allowed = ["/dashboard", "/saya", "/settings/account"]
    if (!allowed.some((p) => pathname === p || pathname.startsWith(p + "/"))) redirect("/saya")
  }

  // Context switcher hanya untuk Admin Keluarga (bukan Super Admin).
  const scope = await resolveScope()
  let context: { current: string; options: ContextOption[] } | null = null
  if (scope?.canSwitch && session.role !== "super_admin") {
    const current = scope.mode === "family" ? "family" : `user:${scope.targetUserId}`
    context = {
      current,
      options: [
        { value: "family", label: "🏠 Laporan Keluarga" },
        ...scope.members.map((m) => ({
          value: `user:${m.user_id}`,
          label: m.user_id === session.userId
            ? `👤 Personal: ${m.name} (Saya)`
            : `👁 ${m.name} (Read-only)`,
        })),
      ],
    }
  }

  // Super admin bekerja di seluruh SaaS, bukan satu keluarga.
  const isSuperAdmin = session.role === "super_admin"
  const familyMode = !isSuperAdmin && scope?.mode === "family"

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session.username} role={session.role} context={context} familyMode={familyMode} />
      {scope?.readOnly && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
          Mode baca-saja: Anda melihat data anggota lain. Beralih ke mode Anda untuk mengubah data.
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
