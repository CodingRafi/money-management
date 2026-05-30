import { pool } from "@/lib/db"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableToolbar } from "@/components/table-toolbar"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { parsePageParams, buildOffset, buildParamsStr, searchTerm, totalPages } from "@/lib/paginate"
import { parseUserAgent } from "@/lib/user-agent"
import { DeleteLicenceButton } from "./delete-licence-button"
import { AdminRevokeSessionButton } from "./admin-revoke-session-button"
import { ArrowLeft, Monitor, Smartphone } from "lucide-react"
import Link from "next/link"

type LicenceRow = {
  id: string; code: string; status: string
  grace_period: number; expired_at: Date | null
  created_at: Date; price: number | null
  user_id: string | null; user_name: string | null; user_email: string | null
}
type SessionRow = {
  id: string
  "ipAddress": string | null
  "userAgent": string | null
  "createdAt": Date
  "updatedAt": Date
  "expiresAt": Date
}

const statusLabel: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE:    { label: "Aktif",         variant: "default" },
  GRACE:     { label: "Masa Tenggang", variant: "secondary" },
  EXPIRED:   { label: "Expired",       variant: "destructive" },
  SUSPENDED: { label: "Dinonaktifkan", variant: "outline" },
}

function fmtDate(d: Date | null) {
  if (!d) return "Seumur hidup"
  return new Date(d).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}
function fmtDateShort(d: Date | null) {
  if (!d) return "Seumur hidup"
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export default async function LicenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp      = await searchParams
  const pparams = parsePageParams(sp)
  const offset  = buildOffset(pparams)
  const pstr    = buildParamsStr(sp)
  const term    = searchTerm(pparams)

  const { rows: licRows } = await pool.query<LicenceRow>(`
    SELECT l.id, l.code, l.status, l.grace_period, l.expired_at,
           l.created_at, l.price, l.user_id,
           u.name AS user_name, u.email AS user_email
    FROM licences l LEFT JOIN "user" u ON u.id = l.user_id
    WHERE l.id = $1
  `, [id])

  if (!licRows[0]) notFound()
  const lic = licRows[0]

  // Ambil sesi aktif user — hanya jika ada user yang mengklaim
  const [countRes, sessionsRes] = lic.user_id
    ? await Promise.all([
        pool.query<{ count: string }>(`
          SELECT COUNT(*)::text AS count
          FROM session
          WHERE "userId" = $1 AND "expiresAt" > NOW()
            AND ($2::text IS NULL
              OR "ipAddress" ILIKE '%' || $2 || '%'
              OR "userAgent" ILIKE '%' || $2 || '%')
        `, [lic.user_id, term]),
        pool.query<SessionRow>(`
          SELECT id, "ipAddress", "userAgent", "createdAt", "updatedAt", "expiresAt"
          FROM session
          WHERE "userId" = $1 AND "expiresAt" > NOW()
            AND ($2::text IS NULL
              OR "ipAddress" ILIKE '%' || $2 || '%'
              OR "userAgent" ILIKE '%' || $2 || '%')
          ORDER BY "updatedAt" DESC
          LIMIT $3 OFFSET $4
        `, [lic.user_id, term, pparams.limit, offset]),
      ])
    : [{ rows: [{ count: "0" }] }, { rows: [] }]

  const total    = parseInt(countRes.rows[0]?.count ?? "0")
  const sessions = sessionsRes.rows
  const tp       = totalPages(total, pparams.limit)
  const st       = statusLabel[lic.status] ?? { label: lic.status, variant: "outline" as const }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/licences">
              <ArrowLeft className="h-4 w-4 mr-1" />Kembali
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold font-mono tracking-wider">{lic.code}</h1>
            <p className="text-sm text-muted-foreground">Detail lisensi & sesi login pengguna</p>
          </div>
        </div>
        {!lic.user_id && <DeleteLicenceButton licenceId={lic.id} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Kiri: info lisensi */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Info Lisensi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              { label: "Status",   value: <Badge variant={st.variant}>{st.label}</Badge> },
              { label: "Pengguna", value: lic.user_email
                ? <div className="text-right"><p className="font-medium">{lic.user_name}</p><p className="text-xs text-muted-foreground">{lic.user_email}</p></div>
                : <span className="italic text-muted-foreground">Belum diklaim</span> },
              { label: "Harga",   value: lic.price !== null
                ? <span className="font-semibold">Rp {lic.price.toLocaleString("id-ID")}</span>
                : <span className="italic text-muted-foreground">—</span> },
              { label: "Expired",       value: fmtDateShort(lic.expired_at) },
              { label: "Grace Period",  value: `${lic.grace_period} hari` },
              { label: "Dibuat",        value: fmtDateShort(lic.created_at) },
              { label: "Sesi Aktif",    value: <span className="font-semibold">{total}</span> },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{label}</span>
                <div>{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Kanan: session list */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Sesi Login Aktif
                <span className="ml-2 text-sm font-normal text-muted-foreground">({total})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!lic.user_id ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Lisensi belum diklaim oleh pengguna.
                </p>
              ) : (
                <>
                  <TableToolbar
                    defaultSearch={pparams.search}
                    currentLimit={pparams.limit}
                    paramsStr={pstr}
                    total={total}
                    placeholder="Cari IP atau browser..."
                  />

                  <div className="space-y-3 mt-1">
                    {sessions.length === 0 && (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        {pparams.search
                          ? `Tidak ada hasil untuk "${pparams.search}"`
                          : "Tidak ada sesi aktif saat ini."}
                      </p>
                    )}

                    {sessions.map((s) => {
                      const { browser, os, isMobile } = parseUserAgent(s.userAgent)
                      return (
                        <div key={s.id} className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {isMobile
                                ? <Smartphone className="h-5 w-5 text-muted-foreground" />
                                : <Monitor className="h-5 w-5 text-muted-foreground" />}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-medium text-sm">{browser} — {os}</p>
                              <p className="text-xs text-muted-foreground">IP: {s.ipAddress ?? "-"}</p>
                              <p className="text-xs text-muted-foreground">Login: {fmtDate(s.createdAt)}</p>
                              <p className="text-xs text-muted-foreground">Terakhir aktif: {fmtDate(s.updatedAt)}</p>
                            </div>
                          </div>
                          <AdminRevokeSessionButton sessionId={s.id} licenceId={lic.id} />
                        </div>
                      )
                    })}
                  </div>

                  <PaginationBar
                    page={pparams.page} totalPages={tp}
                    total={total} limit={pparams.limit} paramsStr={pstr}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
