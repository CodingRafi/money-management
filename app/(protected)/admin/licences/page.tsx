import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableToolbar } from "@/components/table-toolbar"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { parsePageParams, buildOffset, buildParamsStr, searchTerm, totalPages } from "@/lib/paginate"
import Link from "next/link"
import { Plus, Key, TrendingUp } from "lucide-react"
import { LicenceActionsMenu } from "./licence-actions-menu"

type LicenceRow = {
  id: string; code: string; status: string
  grace_period: number; expired_at: Date | null
  created_at: Date; price: number | null
  user_email: string | null; user_name: string | null
  session_count: string
}
type StatRow = { total: string; active: string; grace: string; revenue: string }

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE:    { label: "Aktif",         variant: "default" },
  GRACE:     { label: "Masa Tenggang", variant: "secondary" },
  EXPIRED:   { label: "Expired",       variant: "destructive" },
  SUSPENDED: { label: "Dinonaktifkan", variant: "outline" },
}

function fmtDate(d: Date | null) {
  if (!d) return "Seumur hidup"
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}
function fmtRp(v: number | null) {
  if (v === null) return <span className="text-muted-foreground italic">—</span>
  return "Rp " + v.toLocaleString("id-ID")
}

export default async function LicencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp     = await searchParams
  const params = parsePageParams(sp)
  const offset = buildOffset(params)
  const pstr   = buildParamsStr(sp)
  const term   = searchTerm(params)

  const [statRes, countRes, rowsRes] = await Promise.all([
    pool.query<StatRow>(`
      SELECT
        COUNT(*)::text                                      AS total,
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::text    AS active,
        COUNT(*) FILTER (WHERE status = 'GRACE')::text     AS grace,
        COALESCE(SUM(price), 0)::text                      AS revenue
      FROM licences
    `),
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM licences l LEFT JOIN "user" u ON u.id = l.user_id
      WHERE ($1::text IS NULL
        OR l.code  ILIKE '%' || $1 || '%'
        OR u.email ILIKE '%' || $1 || '%'
        OR u.name  ILIKE '%' || $1 || '%')
    `, [term]),
    pool.query<LicenceRow>(`
      SELECT
        l.id, l.code, l.status, l.grace_period, l.expired_at, l.created_at, l.price,
        u.email AS user_email, u.name AS user_name,
        COUNT(s.id) FILTER (WHERE s."expiresAt" > NOW())::text AS session_count
      FROM licences l
      LEFT JOIN "user" u ON u.id = l.user_id
      LEFT JOIN session s ON s."userId" = l.user_id
      WHERE ($1::text IS NULL
        OR l.code  ILIKE '%' || $1 || '%'
        OR u.email ILIKE '%' || $1 || '%'
        OR u.name  ILIKE '%' || $1 || '%')
      GROUP BY l.id, u.email, u.name
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3
    `, [term, params.limit, offset]),
  ])

  const stat  = statRes.rows[0]
  const total = parseInt(countRes.rows[0]?.count ?? "0")
  const rows  = rowsRes.rows
  const tp    = totalPages(total, params.limit)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manajemen Lisensi</h1>
          <p className="text-sm text-muted-foreground">Kelola semua kode lisensi aplikasi</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/licences/revenue">
              <TrendingUp className="h-4 w-4 mr-2" />Laporan Revenue
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/licences/generate">
              <Plus className="h-4 w-4 mr-2" />Generate Lisensi
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Total Revenue",  value: "Rp " + parseFloat(stat.revenue).toLocaleString("id-ID") },
          { label: "Aktif",          value: stat.active },
          { label: "Masa Tenggang",  value: stat.grace },
          { label: "Total Lisensi",  value: stat.total },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Key className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><p className="text-2xl font-bold">{value}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-5">
          <TableToolbar
            defaultSearch={params.search} currentLimit={params.limit}
            paramsStr={pstr} total={total} placeholder="Cari kode, email, nama..."
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium">Kode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Pengguna</th>
                  <th className="px-4 py-3 text-left font-medium">Sesi Aktif</th>
                  <th className="px-4 py-3 text-left font-medium">Harga</th>
                  <th className="px-4 py-3 text-left font-medium">Expired</th>
                  <th className="px-4 py-3 text-left font-medium">Dibuat</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                      {params.search ? `Tidak ada hasil untuk "${params.search}"` : "Belum ada lisensi."}
                    </td>
                  </tr>
                )}
                {rows.map((lic) => {
                  const st = statusLabel[lic.status] ?? { label: lic.status, variant: "outline" as const }
                  return (
                    <tr key={lic.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-medium tracking-wider">{lic.code}</td>
                      <td className="px-4 py-3"><Badge className="text-nowrap" variant={st.variant}>{st.label}</Badge></td>
                      <td className="px-4 py-3">
                        {lic.user_email
                          ? <div><p className="font-medium">{lic.user_name}</p><p className="text-xs text-muted-foreground">{lic.user_email}</p></div>
                          : <span className="text-muted-foreground italic">Belum diklaim</span>}
                      </td>
                      <td className="px-4 py-3">{lic.session_count}</td>
                      <td className="px-4 py-3 font-medium">{fmtRp(lic.price)}</td>
                      <td className="px-4 py-3">{fmtDate(lic.expired_at)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(lic.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <LicenceActionsMenu
                          licenceId={lic.id} status={lic.status}
                          noExpiry={!lic.expired_at} currentPrice={lic.price}
                          isClaimed={!!lic.user_email}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar page={params.page} totalPages={tp} total={total} limit={params.limit} paramsStr={pstr} />
        </CardContent>
      </Card>
    </div>
  )
}
