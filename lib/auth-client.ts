// Stub — replaced by simple cookie auth in the desktop version.
export const authClient = {
  signIn: { social: async () => {} },
  signOut: async () => {},
  useSession: () => ({ data: null }),
}
export const signIn = authClient.signIn
export const signOut = authClient.signOut
export const useSession = authClient.useSession
