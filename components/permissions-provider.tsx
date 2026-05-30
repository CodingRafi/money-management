"use client"

import { useEffect } from "react"
import { useSetAtom } from "jotai"
import { permissionsAtom } from "@/lib/permission-atoms"

interface PermissionsProviderProps {
  // Server-fetched permissions passed as props on first render — zero DB round-trip on client
  initialPermissions: string[]
}

export function PermissionsProvider({ initialPermissions }: PermissionsProviderProps) {
  const setPermissions = useSetAtom(permissionsAtom)

  useEffect(() => {
    setPermissions(initialPermissions)
  }, [initialPermissions, setPermissions])

  return null
}
