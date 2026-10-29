import { requireSuperAdmin } from "@/lib/session"
import { PERMISSION } from "@/lib/permissions"
import { licenseService, EXPIRING_SOON_DAYS } from "@/services/license.service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { rupiah, formatTanggal, daysUntil } from "@/lib/utils"
import { LicenseStatusBadge } from "./_components/status-badge"
import { RenewLicenseForm } from "./_components/license-forms"

const EVENT_LABEL: Record<string, string> = {
  sale: "Penjualan",
  renewal: "Perpanjangan",
  status_change: "Ubah status",
  upgrade: "Upgrade paket",
  created: "Dibuat",
  member_change: "Perubahan anggota",
}

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: string
  hint?: string
  tone?: "default" | "warn" | "danger" | "ok"
}) {
  const toneClass =
    tone === "warn"
      ? "text-amber-600"
      : tone === "danger"
        ? "text-destructive"
        : tone === "ok"
          ? "text-emerald-600"
          : ""
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default async function SuperAdminMonitoringPage() {
  const session = await requireSuperAdmin(PERMISSION.MONITORING.VIEW)
  const snap = await licenseService.monitoring()

  const totalExpired = snap.byStatus.expired + snap.byStatus.suspended
  const totalActive = snap.byStatus.active + snap.byStatus.trial

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monitoring Penjualan &amp; Lisensi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ringkasan seluruh keluarga terdaftar, status lisensi, dan siapa yang akan segera kadaluarsa.
        </p>
      </div>

      {/* ── Kartu ringkasan ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Keluarga"
          value={String(snap.households)}
          hint={`${snap.members} anggota terdaftar`}
        />
        <StatCard
          label="Total Pendapatan"
          value={rupiah(snap.revenue)}
          hint="Akumulasi nilai jual lisensi"
          tone="ok"
        />
        <StatCard
          label="Aktif / Trial"
          value={String(totalActive)}
          hint={`${snap.byStatus.active} active · ${snap.byStatus.trial} trial`}
          tone="ok"
        />
        <StatCard
          label="Segera Expired"
          value={String(snap.expiring.length)}
          hint={`Kadaluarsa dalam ${EXPIRING_SOON_DAYS} hari`}
          tone={snap.expiring.length > 0 ? "warn" : "default"}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Expired" value={String(snap.byStatus.expired)} tone="danger" />
        <StatCard label="Suspended" value={String(snap.byStatus.suspended)} tone="danger" />
        <StatCard label="Total Expired / Suspended" value={String(totalExpired)} tone="danger" />
        <StatCard
          label="Paket Terjual"
          value={String(snap.revenueByPlan.reduce((n, p) => n + p.households, 0))}
          hint={snap.revenueByPlan.map((p) => `${p.plan_type}: ${p.households}`).join(" · ")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Segera kadaluarsa ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Segera Kadaluarsa ({snap.expiring.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Keluarga</th>
                  <th className="px-4 py-2">Kadaluarsa</th>
                  <th className="px-4 py-2">Sisa</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {snap.expiring.map((f) => {
                  const days = daysUntil(f.expires_at)
                  return (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium">{f.name}</td>
                      <td className="px-4 py-2">{formatTanggal(f.expires_at)}</td>
                      <td className="px-4 py-2">
                        <Badge variant={(days ?? 99) <= 7 ? "destructive" : "warning"}>
                          {days ?? 0} hari
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <RenewLicenseForm family={f} role={session.role} />
                      </td>
                    </tr>
                  )
                })}
                {snap.expiring.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      Tidak ada lisensi yang akan segera kadaluarsa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── Sudah expired ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Sudah Expired / Ditangguhkan ({snap.expired.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Keluarga</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Kadaluarsa</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {snap.expired.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{f.name}</td>
                    <td className="px-4 py-2">
                      <LicenseStatusBadge status={f.status} effectiveExpired />
                    </td>
                    <td className="px-4 py-2">{formatTanggal(f.expires_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <RenewLicenseForm family={f} role={session.role} />
                    </td>
                  </tr>
                ))}
                {snap.expired.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      Semua lisensi masih aktif.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Penjualan per paket ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Penjualan per Paket</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Paket</th>
                  <th className="px-4 py-2">Keluarga</th>
                  <th className="px-4 py-2 text-right">Pendapatan</th>
                </tr>
              </thead>
              <tbody>
                {snap.revenueByPlan.map((p) => (
                  <tr key={p.plan_type} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{p.plan_type}</td>
                    <td className="px-4 py-2">{p.households}</td>
                    <td className="px-4 py-2 text-right">{rupiah(p.revenue)}</td>
                  </tr>
                ))}
                {snap.revenueByPlan.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      Belum ada data penjualan.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── Riwayat transaksi lisensi ─────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Riwayat Transaksi Lisensi</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Keluarga</th>
                  <th className="px-4 py-2">Jenis</th>
                  <th className="px-4 py-2">Tanggal</th>
                  <th className="px-4 py-2 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody>
                {snap.recentEvents.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{e.household_name}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {EVENT_LABEL[e.event_type] ?? e.event_type}
                      {e.note ? ` · ${e.note}` : ""}
                    </td>
                    <td className="px-4 py-2">{formatTanggal(e.created_at)}</td>
                    <td className="px-4 py-2 text-right">
                      {e.amount > 0 ? rupiah(e.amount) : "-"}
                    </td>
                  </tr>
                ))}
                {snap.recentEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      Belum ada riwayat transaksi.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
