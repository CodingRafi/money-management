// Stub — replaced by lib/auth-simple.ts in the desktop version.
export const auth = {
  api: {
    getSession: async () => null,
    handler: async () => new Response("Not available", { status: 404 }),
  },
  handler: async () => new Response("Not available", { status: 404 }),
}
