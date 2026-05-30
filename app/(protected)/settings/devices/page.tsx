import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TableToolbar } from "@/components/table-toolbar"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { parsePageParams, buildOffset, buildParamsStr, searchTerm, totalPages } from "@/lib/paginate"
import { parseUserAgent } from "@/lib/user-agent"
import { Monitor, Smartphone, ShieldCheck } from "lucide-react"
import { RevokeSessionButton } from "./revoke-session-button"

type SessionRow = {
  id: string
  "ipAddress": string | null
  "userAgent": string | null
  "createdAt": Date
  "updatedAt": Date
  "expiresAt": Date
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const sp      = await searchParams
  const params  = parsePageParams(sp)
  const offset  = buildOffset(params)
  const pstr    = buildParamsStr(sp)
  const term    = searchTerm(params)

  const [countRes, sessionsRes] = await Promise.all([
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM session
      WHERE "userId" = $1
        AND "expiresAt" > NOW()
        AND ($2::text IS NULL
          OR "ipAddress" ILIKE '%' || $2 || '%'
          OR "userAgent" ILIKE '%' || $2 || '%')
    `, [session.user.id, term]),
    pool.query<SessionRow>(`
      SELECT id, "ipAddress", "userAgent", "createdAt", "updatedAt", "expiresAt"
      FROM session
      WHERE "userId" = $1
        AND "expiresAt" > NOW()
        AND ($2::text IS NULL
          OR "ipAddress" ILIKE '%' || $2 || '%'
          OR "userAgent" ILIKE '%' || $2 || '%')
      ORDER BY "updatedAt" DESC
      LIMIT $3 OFFSET $4
    `, [session.user.id, term, params.limit, offset]),
  ])

  const total    = parseInt(countRes.rows[0]?.count ?? "0")
  const sessions = sessionsRes.rows
  const tp       = totalPages(total, params.limit)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Perangkat Login</h1>
        <p className="text-sm text-muted-foreground">
          Semua sesi login aktif akun kamu. Logout dari perangkat yang tidak kamu kenal.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <TableToolbar
            defaultSearch={params.search}
            currentLimit={params.limit}
            paramsStr={pstr}
            total={total}
            placeholder="Cari IP atau browser..."
          />

          <div className="space-y-3 mt-1">
            {sessions.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {params.search ? `Tidak ada hasil untuk "${params.search}"` : "Tidak ada sesi aktif."}
              </p>
            )}

            {sessions.map((s) => {
              const { browser, os, isMobile } = parseUserAgent(s.userAgent)
              const isCurrent = s.id === session.session.id

              return (
                <div key={s.id} className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {isMobile
                        ? <Smartphone className="h-5 w-5 text-muted-foreground" />
                        : <Monitor className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{browser} — {os}</p>
                        {isCurrent && (
                          <Badge variant="default" className="text-xs gap-1 h-5">
                            <ShieldCheck className="h-3 w-3" />
                            Sesi ini
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        IP: {s.ipAddress ?? "-"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Login: {fmtDate(s.createdAt)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Terakhir aktif: {fmtDate(s.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <RevokeSessionButton sessionId={s.id} isCurrent={isCurrent} />
                </div>
              )
            })}
          </div>

          <PaginationBar page={params.page} totalPages={tp} total={total} limit={params.limit} paramsStr={pstr} />
        </CardContent>
      </Card>
    </div>
  )
}
