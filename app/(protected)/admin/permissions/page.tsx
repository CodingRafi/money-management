import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableToolbar } from "@/components/table-toolbar"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { parsePageParams, buildOffset, buildParamsStr, searchTerm, totalPages } from "@/lib/paginate"
import { createPermission, deletePermission } from "@/app/actions/admin"
import { Trash2 } from "lucide-react"

type PermRow = { id: string; codename: string; name: string; role_count: string }

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp     = await searchParams
  const params = parsePageParams(sp)
  const offset = buildOffset(params)
  const pstr   = buildParamsStr(sp)
  const term   = searchTerm(params)

  const [countRes, permsRes] = await Promise.all([
    pool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM permissions
      WHERE ($1::text IS NULL
        OR codename ILIKE '%' || $1 || '%'
        OR name     ILIKE '%' || $1 || '%')
    `, [term]),
    pool.query<PermRow>(`
      SELECT p.id, p.codename, p.name, COUNT(rp.role_id)::text AS role_count
      FROM permissions p
      LEFT JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE ($1::text IS NULL
        OR p.codename ILIKE '%' || $1 || '%'
        OR p.name     ILIKE '%' || $1 || '%')
      GROUP BY p.id
      ORDER BY p.codename
      LIMIT $2 OFFSET $3
    `, [term, params.limit, offset]),
  ])

  const total       = parseInt(countRes.rows[0]?.count ?? "0")
  const permissions = permsRes.rows
  const tp          = totalPages(total, params.limit)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Permissions</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">New Permission</CardTitle></CardHeader>
        <CardContent>
          <form action={createPermission} className="flex flex-wrap gap-3">
            <Input
              name="codename"
              placeholder="codename (e.g. add_transaction)"
              required
              className="max-w-xs font-mono text-sm"
            />
            <Input name="name" placeholder="Human-readable name" required className="max-w-sm" />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <TableToolbar
            defaultSearch={params.search}
            currentLimit={params.limit}
            paramsStr={pstr}
            total={total}
            placeholder="Cari codename atau nama..."
          />
          <div className="space-y-2">
            {permissions.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {params.search ? `Tidak ada hasil untuk "${params.search}"` : "No permissions yet."}
              </p>
            )}
            {permissions.map((perm) => (
              <div key={perm.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="font-mono text-sm font-medium">{perm.codename}</p>
                  <p className="text-xs text-muted-foreground">
                    {perm.name} · used in {perm.role_count} role(s)
                  </p>
                </div>
                <form action={deletePermission.bind(null, perm.id)}>
                  <Button type="submit" variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            ))}
          </div>
          <PaginationBar page={params.page} totalPages={tp} total={total} limit={params.limit} paramsStr={pstr} />
        </CardContent>
      </Card>
    </div>
  )
}
