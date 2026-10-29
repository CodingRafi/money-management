import { requireRole } from "@/lib/session"
import { licenseRepository } from "@/repositories/license.repository"
import { evaluateLicense } from "@/dtos/license"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CreateFamilyForm, EditLicenseForm } from "./_components/license-forms"

const STATUS_LABEL = {
  active: "🟢 Active",
  trial: "🟡 Trial",
  expired: "🔴 Expired",
  suspended: "⛔ Suspended",
} as const

export default async function SuperAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRole("super_admin")
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 64) : ""
  const families = await licenseRepository.listHouseholds(q)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Super Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kelola keluarga terdaftar dan lisensinya</p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <CreateFamilyForm />
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari keluarga / username"
            className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
        </form>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Keluarga ({families.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Nama Keluarga</th>
                <th className="px-4 py-2">Admin</th>
                <th className="px-4 py-2">Paket</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Kadaluarsa</th>
                <th className="px-4 py-2">Kuota</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {families.map((f) => {
                const effective = evaluateLicense({
                  id: "", household_id: f.id, plan_type: f.plan_type, status: f.status,
                  max_members: f.max_members, starts_at: "", expires_at: f.expires_at,
                })
                const label = !effective.ok && effective.reason === "expired" ? STATUS_LABEL.expired : STATUS_LABEL[f.status]
                return (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{f.name}</td>
                    <td className="px-4 py-2">{f.admin_username ?? "-"}</td>
                    <td className="px-4 py-2">{f.plan_type}</td>
                    <td className="px-4 py-2"><Badge variant="outline">{label}</Badge></td>
                    <td className="px-4 py-2">
                      {f.expires_at ? new Date(f.expires_at).toLocaleDateString("id-ID") : "Tanpa batas"}
                    </td>
                    <td className="px-4 py-2">{f.member_count}/{f.max_members} User</td>
                    <td className="px-4 py-2 text-right">
                      <EditLicenseForm family={f} />
                    </td>
                  </tr>
                )
              })}
              {families.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Belum ada keluarga</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
