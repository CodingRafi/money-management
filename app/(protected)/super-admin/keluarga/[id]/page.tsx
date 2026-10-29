import Link from "next/link"
import { notFound } from "next/navigation"
import { requireSuperAdmin } from "@/lib/session"
import { PERMISSION } from "@/lib/permissions"
import { licenseRepository } from "@/repositories/license.repository"
import { memberRepository } from "@/repositories/member.repository"
import { licenseEventRepository } from "@/repositories/license-event.repository"
import { evaluateLicense } from "@/dtos/license"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { rupiah, formatTanggal } from "@/lib/utils"
import { LicenseStatusBadge } from "../../_components/status-badge"
import { AddMemberForm, RemoveMemberButton, SetPasswordForm } from "../../_components/member-forms"
import { EditLicenseForm, RecordSaleForm, RenewLicenseForm } from "../../_components/license-forms"

const EVENT_LABEL: Record<string, string> = {
  sale: "Penjualan",
  renewal: "Perpanjangan",
  status_change: "Ubah status",
  upgrade: "Upgrade paket",
  created: "Dibuat",
  member_change: "Perubahan anggota",
}

export default async function SuperAdminFamilyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSuperAdmin(PERMISSION.FAMILY.VIEW)
  const { id } = await params

  const household = await licenseRepository.findHousehold(id)
  if (!household) notFound()

  const [summary, members, events] = await Promise.all([
    licenseRepository.findSummaryByHousehold(id),
    memberRepository.list(id),
    licenseEventRepository.listByHousehold(id),
  ])

  if (!summary) notFound()

  const license = {
    ...summary,
    starts_at: household.created_at,
  }
  const effective = evaluateLicense({
    id: "", household_id: household.id, plan_type: license.plan_type, status: license.status,
    max_members: license.max_members, starts_at: household.created_at, expires_at: license.expires_at,
    price: license.price, sold_at: license.sold_at,
  })
  const effectiveExpired = !effective.ok && effective.reason === "expired"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/super-admin/keluarga">← Semua Keluarga</Link>
          </Button>
          <h1 className="mt-1 text-2xl font-bold">{household.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dibuat {formatTanggal(household.created_at)} · Admin:{" "}
            {summary.admin_username ?? "-"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <EditLicenseForm family={summary} role={session.role} />
          <RenewLicenseForm family={summary} role={session.role} />
          <RecordSaleForm family={summary} role={session.role} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="mt-2">
              <LicenseStatusBadge status={license.status} effectiveExpired={effectiveExpired} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Paket</p>
            <p className="mt-1 text-2xl font-bold">{license.plan_type}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nilai Jual</p>
            <p className="mt-1 text-2xl font-bold">{rupiah(license.price)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {license.sold_at ? `Terjual ${formatTanggal(license.sold_at)}` : "Belum ada transaksi"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kuota</p>
            <p className="mt-1 text-2xl font-bold">
              {members.length}/{license.max_members}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {license.expires_at ? `Kadaluarsa ${formatTanggal(license.expires_at)}` : "Tanpa batas"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Anggota Keluarga ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {m.name} <span className="text-muted-foreground">({m.username})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.relation ?? "-"} · {m.role}
                    {m.role === "child" && m.spending_limit != null &&
                      ` · limit ${rupiah(m.spending_limit)}/bulan`}
                  </p>
                  {!m.has_password && (
                    <p className="text-xs font-medium text-amber-600">
                      Belum punya password — akun ini belum bisa login.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge variant="outline">{m.role}</Badge>
                  {!m.has_password && (
                    <SetPasswordForm
                      role={session.role}
                      householdId={household.id}
                      userId={m.user_id}
                      name={m.name}
                    />
                  )}
                  <RemoveMemberButton
                    role={session.role}
                    householdId={household.id}
                    userId={m.user_id}
                    name={m.name}
                  />
                </div>
              </li>
            ))}
            {members.length === 0 && (
              <li className="px-5 py-6 text-center text-sm text-muted-foreground">
                Belum ada anggota.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      <AddMemberForm
        role={session.role}
        householdId={household.id}
        householdName={household.name}
        used={members.length}
        max={license.max_members}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Riwayat Lisensi</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Jenis</th>
                <th className="px-4 py-2">Keterangan</th>
                <th className="px-4 py-2">Tanggal</th>
                <th className="px-4 py-2 text-right">Nominal</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">
                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{e.note ?? "-"}</td>
                  <td className="px-4 py-2">{formatTanggal(e.created_at)}</td>
                  <td className="px-4 py-2 text-right">{e.amount > 0 ? rupiah(e.amount) : "-"}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    Belum ada riwayat.
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
