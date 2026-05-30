import { betterAuth } from "better-auth"
import { pool } from "./db"

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
  databaseHooks: {
    user: {
      create: {
        async after(user) {
          try {
            await pool.query(
              `INSERT INTO user_roles (user_id, role_id)
               SELECT $1, id FROM roles WHERE name = 'user'
               ON CONFLICT DO NOTHING`,
              [user.id],
            )
          } catch {
            // Permission tables may not exist yet — run /api/admin/setup first
          }
        },
      },
    },
  },
})
