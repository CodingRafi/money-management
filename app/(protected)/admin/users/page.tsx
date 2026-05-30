import { pool } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { assignRoleToUser, removeRoleFromUser } from "@/app/actions/admin"

type UserRow = { id: string; name: string; email: string; image: string | null }
type Role = { id: string; name: string }
type UserRole = { user_id: string; role_id: string }

export default async function UsersPage() {
  const [usersResult, rolesResult, userRolesResult] = await Promise.all([
    pool.query<UserRow>(`SELECT id, name, email, image FROM "user" ORDER BY "createdAt"`),
    pool.query<Role>(`SELECT id, name FROM roles ORDER BY name`),
    pool.query<UserRole>(`SELECT user_id, role_id FROM user_roles`),
  ])

  const users = usersResult.rows
  const roles = rolesResult.rows
  const userRolesMap = userRolesResult.rows.reduce<Record<string, Set<string>>>((acc, ur) => {
    if (!acc[ur.user_id]) acc[ur.user_id] = new Set()
    acc[ur.user_id].add(ur.role_id)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Users</h1>

      <div className="space-y-4">
        {users.map((user) => {
          const userRoleIds = userRolesMap[user.id] ?? new Set<string>()
          const initials = user.name
            .split(" ")
            .map((n) => n[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()

          return (
            <Card key={user.id}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.image ?? undefined} />
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                      {roles.map((role) => {
                        const has = userRoleIds.has(role.id)
                        return (
                          <div key={role.id} className="flex items-center gap-2">
                            {has ? (
                              <Badge variant="secondary">{role.name}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                {role.name}
                              </Badge>
                            )}
                            {has ? (
                              <form action={removeRoleFromUser.bind(null, user.id, role.id)}>
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                                >
                                  Remove
                                </Button>
                              </form>
                            ) : (
                              <form action={assignRoleToUser.bind(null, user.id, role.id)}>
                                <Button
                                  type="submit"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                >
                                  Assign
                                </Button>
                              </form>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
        {users.length === 0 && (
          <p className="text-sm text-muted-foreground">No users found.</p>
        )}
      </div>
    </div>
  )
}
