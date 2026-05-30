import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createRole, deleteRole } from "@/app/actions/admin"
import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"

type RoleRow = {
  id: string
  name: string
  description: string | null
  perm_count: string
}

export default async function RolesPage() {
  const { rows: roles } = await pool.query<RoleRow>(
    `SELECT r.id, r.name, r.description, COUNT(rp.permission_id)::text AS perm_count
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     GROUP BY r.id
     ORDER BY r.created_at`,
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Roles</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New Role</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createRole} className="flex flex-wrap gap-3">
            <Input name="name" placeholder="Role name (e.g. editor)" required className="max-w-xs" />
            <Input name="description" placeholder="Description (optional)" className="max-w-sm" />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {roles.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium">{role.name}</p>
                    {role.description && (
                      <p className="text-xs text-muted-foreground">{role.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary">{role.perm_count} permissions</Badge>
                </div>
                <div className="flex gap-1">
                  <Button asChild variant="ghost" size="icon">
                    <Link href={`/admin/roles/${role.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Link>
                  </Button>
                  <form action={deleteRole.bind(null, role.id)}>
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
              </div>
            ))}
            {roles.length === 0 && (
              <p className="text-sm text-muted-foreground">No roles yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
