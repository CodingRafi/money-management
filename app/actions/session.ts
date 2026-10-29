"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import {
  verifyPassword,
  createSession,
  deleteSession,
  changeCredentials,
  isRateLimited,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/auth-simple"
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, requireSessionAction } from "@/lib/session"

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username dan password wajib diisi").max(64),
  password: z.string().min(1, "Username dan password wajib diisi").max(256),
})

const credentialsSchema = z
  .object({
    current_password: z.string().min(1, "Password saat ini wajib diisi"),
    username: z.string().trim().min(3, "Username minimal 3 karakter").max(64),
    password: z.string().min(8, "Password minimal 8 karakter").max(256),
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm_password"],
  })

async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}

export async function login(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { username, password } = parsed.data

  const ids = [`ip:${await clientIp()}`, `user:${username.toLowerCase()}`]
  if (await isRateLimited(ids)) {
    return { error: "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit." }
  }

  const userId = await verifyPassword(username, password)
  if (!userId) {
    await recordFailedLogin(ids)
    return { error: "Username atau password salah" }
  }
  await clearFailedLogins([ids[1]])

  const token = await createSession(userId)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS)
  redirect("/dashboard")
}

export async function logout() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) await deleteSession(token)
  cookieStore.delete(SESSION_COOKIE)
  redirect("/login")
}

export async function updateCredentials(_prev: unknown, formData: FormData) {
  let session
  try {
    session = await requireSessionAction()
  } catch {
    return { error: "Tidak terautentikasi" }
  }

  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  if (!(await verifyPassword(session.username, v.current_password))) {
    return { error: "Password saat ini salah" }
  }

  try {
    await changeCredentials(session.userId, v.username, v.password)
  } catch {
    return { error: "Username sudah dipakai" }
  }
  revalidatePath("/settings")
  return { success: true }
}
