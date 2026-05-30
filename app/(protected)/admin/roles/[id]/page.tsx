import { pool } from "@/lib/db"
import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { addPermissionToRole, removePermissionFromRole } from "@/app/actions/admin"
import { Plus, Minus } from "lucide-react"

type Role = { id: string; name: string; description: string | null }
type PermRow = { id: string; codename: string; name: string; assigned: boolean }

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [roleResult, permsResult] = await Promise.all([
    pool.query<Role>(`SELECT id, name, description FROM roles WHERE id = $1`, [id]),
    pool.query<PermRow>(
      `SELECT p.id, p.codename, p.name,
              EXISTS(
                SELECT 1 FROM role_permissions rp
                WHERE rp.role_id = $1 AND rp.permission_id = p.id
              ) AS assigned
       FROM permissions p
       ORDER BY p.codename`,
      [id],
    ),
  ])

  if (!roleResult.rows[0]) notFound()

  const role = roleResult.rows[0]
  const permissions = permsResult.rows

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{role.name}</h1>
        {role.description && (
          <p className="text-sm text-muted-foreground">{role.description}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {permissions.map((perm) => (
              <div
                key={perm.id}
                className="flex items-center justify-between rounded-lg border px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{perm.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{perm.codename}</p>
                </div>
                {perm.assigned ? (
                  <form action={removePermissionFromRole.bind(null, role.id, perm.id)}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <Minus className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </form>
                ) : (
                  <form action={addPermissionToRole.bind(null, role.id, perm.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="gap-1">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                  </form>
                )}
              </div>
            ))}
            {permissions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No permissions defined yet. Create some in the Permissions section.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
