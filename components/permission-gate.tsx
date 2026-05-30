import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { userHasPermission, userHasAnyPermission } from "@/lib/permissions"

interface PermissionGateProps {
  permission?: string
  anyOf?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export async function PermissionGate({
  permission,
  anyOf,
  children,
  fallback = null,
}: PermissionGateProps) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return <>{fallback}</>

  let allowed = false
  try {
    if (permission) {
      allowed = await userHasPermission(session.user.id, permission)
    } else if (anyOf) {
      allowed = await userHasAnyPermission(session.user.id, anyOf)
    }
  } catch {
    // Permission tables not set up yet
  }

  return allowed ? <>{children}</> : <>{fallback}</>
}
