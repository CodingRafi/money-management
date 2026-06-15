interface PermissionGateProps {
  permission?: string
  anyOf?: string[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function PermissionGate({ children }: PermissionGateProps) {
  return <>{children}</>
}
