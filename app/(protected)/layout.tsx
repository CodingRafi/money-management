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

  // Anak hanya boleh /dashboard, /saya, /integrasi/telegram dan pengaturan akun (dicek di server).
  if (session.householdRole === "child") {
    const allowed = ["/dashboard", "/saya", "/integrasi/telegram", "/settings/account"]
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
        {
          value: "family",
          label: "Keluarga",
          description: "Gabungan seluruh anggota",
          kind: "family",
        },
        ...scope.members.map((m) => {
          const isSelf = m.user_id === session.userId
          return {
            value: `user:${m.user_id}`,
            label: isSelf ? `${m.name} (Saya)` : m.name,
            description: isSelf ? "Data pribadi Anda" : "Hanya baca (read-only)",
            kind: "member" as const,
            readOnly: !isSelf,
            isSelf,
          }
        }),
      ],
    }
  }

  // Super admin bekerja di seluruh SaaS, bukan satu keluarga.
  const readOnlyMember = scope?.readOnly
    ? scope.members.find((m) => m.user_id === scope.targetUserId)?.name
    : null

  return (
    <div className="min-h-screen bg-background">
      <Navbar username={session.username} role={session.role} context={context} />
      {scope?.readOnly && (
        <div className="border-b border-amber-300/60 bg-amber-100 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
          Mode baca-saja{readOnlyMember ? ` — data ${readOnlyMember}` : ""}. Beralih ke mode Anda
          sendiri lewat switcher di navbar untuk mengubah data.
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}
