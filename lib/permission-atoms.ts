import { atom } from "jotai"

// Stores the list of permission codenames for the current user.
// Initialized server-side via PermissionsProvider, then stays in memory.
export const permissionsAtom = atom<string[]>([])

// Derive a single-permission check without extra fetches.
export const hasPermissionAtom = (codename: string) =>
  atom((get) => get(permissionsAtom).includes(codename))

export const hasAnyPermissionAtom = (codenames: string[]) =>
  atom((get) => {
    const perms = get(permissionsAtom)
    return codenames.some((c) => perms.includes(c))
  })
