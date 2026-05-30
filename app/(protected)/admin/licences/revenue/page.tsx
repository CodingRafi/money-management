import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableToolbar } from "@/components/table-toolbar"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { parsePageParams, buildOffset, buildParamsStr, searchTerm, totalPages } from "@/lib/paginate"
import { ArrowLeft, TrendingUp, Wallet, TicketCheck, Users } from "lucide-react"
import Link from "next/link"

type MonthRow   = { month: string; count: string; revenue: string; claimed: string }
type StatusRow  = { status: string; count: string; revenue: string }
type LicenceRow = {
  id: string; code: string; status: string; price: number | null
  expired_at: Date | null; created_at: Date
  user_name: string | null; user_email: string | null
}
type SummaryRow = { total_licences: string; total_revenue: string; claimed_licences: string; avg_price: string }

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE:    { label: "Aktif",         variant: "default" },
  GRACE:     { label: "Masa Tenggang", variant: "secondary" },
  EXPIRED:   { label: "Expired",       variant: "destructive" },
  SUSPENDED: { label: "Dinonaktifkan", variant: "outline" },
}

function rp(v: number | string | null) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0)
  return "Rp " + Math.round(n).toLocaleString("id-ID")
}
function fmtDate(d: Date | null) {
  if (!d) return "Seumur hidup"
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}
function monthLabel(raw: string) {
  return new Date(raw).toLocaleDateString("id-ID", { month: "long", year: "numeric" })
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp     = await searchParams
  const params = parsePageParams(sp)
  const offset = buildOffset(params)
  const pstr   = buildParamsStr(sp)
  const term   = searchTerm(params)

  const [summaryRes, monthlyRes, statusRes, countRes, licencesRes] = await Promise.all([
    pool.query<SummaryRow>(`
      SELECT
        COUNT(*)::text AS total_licences,
        COALESCE(SUM(price), 0)::text AS total_revenue,
        COUNT(*) FILTER (WHERE user_id IS NOT NULL)::text AS claimed_licences,
        COALESCE(AVG(price) FILTER (WHERE price IS NOT NULL), 0)::text AS avg_price
      FROM licences
    `),
    pool.query<MonthRow>(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM-DD') AS month,
        COUNT(*)::text AS count,
        COALESCE(SUM(price), 0)::text AS revenue,
        COUNT(*) FILTER (WHERE user_id IS NOT NULL)::text AS claimed
      FROM licences WHERE price IS NOT NULL AND price > 0
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) DESC LIMIT 24
    `),
    pool.query<StatusRow>(`
      SELECT status, COUNT(*)::text AS count, COALESCE(SUM(price), 0)::text AS revenue
      FROM licences WHERE price IS NOT NULL AND price > 0
      GROUP BY status ORDER BY status
    `),
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM licences l LEFT JOIN "user" u ON u.id = l.user_id
      WHERE l.price IS NOT NULL AND l.price > 0
        AND ($1::text IS NULL
          OR l.code    ILIKE '%' || $1 || '%'
          OR u.email   ILIKE '%' || $1 || '%'
          OR u.name    ILIKE '%' || $1 || '%')
    `, [term]),
    pool.query<LicenceRow>(`
      SELECT l.id, l.code, l.status, l.price, l.expired_at, l.created_at,
             u.name AS user_name, u.email AS user_email
      FROM licences l LEFT JOIN "user" u ON u.id = l.user_id
      WHERE l.price IS NOT NULL AND l.price > 0
        AND ($1::text IS NULL
          OR l.code    ILIKE '%' || $1 || '%'
          OR u.email   ILIKE '%' || $1 || '%'
          OR u.name    ILIKE '%' || $1 || '%')
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
    `, [term, params.limit, offset]),
  ])

  const summary      = summaryRes.rows[0]
  const monthly      = monthlyRes.rows
  const byStatus     = statusRes.rows
  const total        = parseInt(countRes.rows[0]?.count ?? "0")
  const paidLicences = licencesRes.rows
  const tp           = totalPages(total, params.limit)
  const maxRevenue   = Math.max(...monthly.map((m) => parseFloat(m.revenue)), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/licences"><ArrowLeft className="h-4 w-4 mr-1" />Lisensi</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Laporan Revenue Lisensi</h1>
          <p className="text-sm text-muted-foreground">Ringkasan pendapatan dari penjualan lisensi</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Revenue",    value: rp(summary.total_revenue),    sub: "Seluruh waktu",         Icon: Wallet },
          { label: "Total Lisensi",    value: summary.total_licences,        sub: `${summary.claimed_licences} diklaim`, Icon: TicketCheck },
          { label: "Rata-rata Harga",  value: rp(summary.avg_price),         sub: "Per lisensi berbayar",  Icon: TrendingUp },
          { label: "Pengguna Aktif",   value: summary.claimed_licences,      sub: `Dari ${summary.total_licences} lisensi`, Icon: Users },
        ].map(({ label, value, sub, Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Revenue per Bulan</CardTitle></CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada data revenue.</p>
            ) : (
              <div className="space-y-3">
                {monthly.map((m) => {
                  const rev = parseFloat(m.revenue)
                  const pct = Math.round((rev / maxRevenue) * 100)
                  return (
                    <div key={m.month} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium w-36 shrink-0">{monthLabel(m.month)}</span>
                        <span className="text-muted-foreground text-xs">
                          {m.count} lisensi · {m.claimed} diklaim
                        </span>
                        <span className="font-semibold">{rp(m.revenue)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue per Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {byStatus.map((s) => {
              const st = statusLabel[s.status] ?? { label: s.status, variant: "outline" as const }
              return (
                <div key={s.status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                    <span className="text-muted-foreground">{s.count}x</span>
                  </div>
                  <span className="font-semibold">{rp(s.revenue)}</span>
                </div>
              )
            })}
            {byStatus.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Tidak ada data.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Paid licences table with search + pagination */}
      <Card>
        <CardHeader><CardTitle className="text-base">Daftar Lisensi Berbayar</CardTitle></CardHeader>
        <CardContent>
          <TableToolbar
            defaultSearch={params.search}
            currentLimit={params.limit}
            paramsStr={pstr}
            total={total}
            placeholder="Cari kode, email, nama..."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Kode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Pengguna</th>
                  <th className="px-4 py-3 text-left font-medium">Harga</th>
                  <th className="px-4 py-3 text-left font-medium">Expired</th>
                  <th className="px-4 py-3 text-left font-medium">Tanggal Beli</th>
                </tr>
              </thead>
              <tbody>
                {paidLicences.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      {params.search ? `Tidak ada hasil untuk "${params.search}"` : "Belum ada lisensi berbayar."}
                    </td>
                  </tr>
                )}
                {paidLicences.map((lic) => {
                  const st = statusLabel[lic.status] ?? { label: lic.status, variant: "outline" as const }
                  return (
                    <tr key={lic.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-medium tracking-wider">{lic.code}</td>
                      <td className="px-4 py-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-3">
                        {lic.user_email ? (
                          <div>
                            <p className="font-medium">{lic.user_name}</p>
                            <p className="text-xs text-muted-foreground">{lic.user_email}</p>
                          </div>
                        ) : <span className="text-muted-foreground italic">Belum diklaim</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-700">{rp(lic.price)}</td>
                      <td className="px-4 py-3">{fmtDate(lic.expired_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(lic.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {paidLicences.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40">
                    <td colSpan={3} className="px-4 py-3 font-semibold">Subtotal halaman ini</td>
                    <td className="px-4 py-3 font-bold text-green-700">
                      {rp(paidLicences.reduce((s, l) => s + (l.price ?? 0), 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <PaginationBar page={params.page} totalPages={tp} total={total} limit={params.limit} paramsStr={pstr} />
        </CardContent>
      </Card>
    </div>
  )
}
