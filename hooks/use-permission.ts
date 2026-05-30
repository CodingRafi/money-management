"use client"

import { useAtomValue } from "jotai"
import { permissionsAtom, hasPermissionAtom, hasAnyPermissionAtom } from "@/lib/permission-atoms"
import { useMemo } from "react"

export function usePermissions() {
  return useAtomValue(permissionsAtom)
}

export function usePermission(codename: string) {
  const atom = useMemo(() => hasPermissionAtom(codename), [codename])
  return useAtomValue(atom)
}

export function useAnyPermission(codenames: string[]) {
  // stable reference so the atom isn't recreated on every render
  const key = codenames.join(",")
  const atom = useMemo(() => hasAnyPermissionAtom(codenames), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return useAtomValue(atom)
}
