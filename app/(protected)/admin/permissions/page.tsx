import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createPermission, deletePermission } from "@/app/actions/admin"
import { Trash2 } from "lucide-react"

type PermRow = {
  id: string
  codename: string
  name: string
  role_count: string
}

export default async function PermissionsPage() {
  const { rows: permissions } = await pool.query<PermRow>(
    `SELECT p.id, p.codename, p.name, COUNT(rp.role_id)::text AS role_count
     FROM permissions p
     LEFT JOIN role_permissions rp ON rp.permission_id = p.id
     GROUP BY p.id
     ORDER BY p.codename`,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Permissions</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Permission</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPermission} className="flex flex-wrap gap-3">
            <Input
              name="codename"
              placeholder="codename (e.g. add_transaction)"
              required
              className="max-w-xs font-mono text-sm"
            />
            <Input
              name="name"
              placeholder="Human-readable name"
              required
              className="max-w-sm"
            />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {permissions.map((perm) => (
              <div
                key={perm.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div>
                  <p className="font-mono text-sm font-medium">{perm.codename}</p>
                  <p className="text-xs text-muted-foreground">
                    {perm.name} · used in {perm.role_count} role(s)
                  </p>
                </div>
                <form action={deletePermission.bind(null, perm.id)}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            ))}
            {permissions.length === 0 && (
              <p className="text-sm text-muted-foreground">No permissions yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
