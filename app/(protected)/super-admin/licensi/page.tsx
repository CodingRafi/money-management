import { requireSuperAdmin } from "@/lib/session"
import { PERMISSION } from "@/lib/permissions"
import { licenseRepository } from "@/repositories/license.repository"
import { evaluateLicense } from "@/dtos/license"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { rupiah, formatTanggal } from "@/lib/utils"
import { LicenseStatusBadge } from "../_components/status-badge"
import {
  CreateFamilyForm,
  EditLicenseForm,
  RecordSaleForm,
  RenewLicenseForm,
} from "../_components/license-forms"

export default async function SuperAdminLicensePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireSuperAdmin(PERMISSION.LICENSE.VIEW)
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 64) : ""
  const families = await licenseRepository.listHouseholds(q)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Kelola Lisensi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Semua keluarga terdaftar beserta paket, status, harga, dan masa berlakunya.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <CreateFamilyForm role={session.role} />
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Cari keluarga / username"
            className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
          <Button type="submit" variant="outline" size="sm">Cari</Button>
        </form>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Daftar Lisensi ({families.length})</CardTitle>
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
                <th className="px-4 py-2">Harga</th>
                <th className="px-4 py-2">Kuota</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {families.map((f) => {
                const effective = evaluateLicense({
                  id: "", household_id: f.id, plan_type: f.plan_type, status: f.status,
                  max_members: f.max_members, starts_at: "", expires_at: f.expires_at,
                  price: f.price, sold_at: f.sold_at,
                })
                const effectiveExpired = !effective.ok && effective.reason === "expired"
                return (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {f.name}
                      {f.sold_at && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          Terjual {formatTanggal(f.sold_at)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{f.admin_username ?? "-"}</td>
                    <td className="px-4 py-2">{f.plan_type}</td>
                    <td className="px-4 py-2">
                      <LicenseStatusBadge status={f.status} effectiveExpired={effectiveExpired} />
                    </td>
                    <td className="px-4 py-2">
                      {f.expires_at ? formatTanggal(f.expires_at) : "Tanpa batas"}
                    </td>
                    <td className="px-4 py-2">{rupiah(f.price)}</td>
                    <td className="px-4 py-2">{f.member_count}/{f.max_members} User</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <EditLicenseForm family={f} role={session.role} />
                        <RenewLicenseForm family={f} role={session.role} />
                        <RecordSaleForm family={f} role={session.role} />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {families.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    Belum ada keluarga terdaftar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
