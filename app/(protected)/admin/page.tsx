import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, Key, Users } from "lucide-react"

export default async function AdminPage() {
  const [rolesResult, permsResult, usersResult] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM roles`),
    pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM permissions`),
    pool.query<{ count: string }>(`SELECT COUNT(*)::text FROM "user"`),
  ])

  const stats = [
    { label: "Total Roles", value: rolesResult.rows[0].count, icon: Shield },
    { label: "Total Permissions", value: permsResult.rows[0].count, icon: Key },
    { label: "Total Users", value: usersResult.rows[0].count, icon: Users },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage roles, permissions, and users</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
