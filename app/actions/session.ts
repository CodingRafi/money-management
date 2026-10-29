"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { verifyPassword, createSession, deleteSession, changeCredentials } from "@/lib/auth-simple"

export async function login(_prev: unknown, formData: FormData) {
  const username = ((formData.get("username") as string) ?? "").trim()
  const password  = (formData.get("password")  as string) ?? ""

  if (!username || !password) return { error: "Username dan password wajib diisi" }
  if (!(await verifyPassword(username, password))) return { error: "Username atau password salah" }

  const token = await createSession()
  const cookieStore = await cookies()
  cookieStore.set("session_token", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   30 * 24 * 60 * 60,
    path:     "/",
  })
  redirect("/dashboard")
}

export async function logout() {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (token) await deleteSession(token)
  cookieStore.delete("session_token")
  redirect("/login")
}

export async function updateCredentials(_prev: unknown, formData: FormData) {
  const newUsername    = ((formData.get("username") as string) ?? "").trim()
  const newPassword    = (formData.get("password")  as string) ?? ""
  const confirmPassword = (formData.get("confirm_password") as string) ?? ""
  const currentPassword = (formData.get("current_password") as string) ?? ""

  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value
  if (!token) return { error: "Tidak terautentikasi" }

  // Verify current password
  const { validateSession, getUsername, verifyPassword: vp } = await import("@/lib/auth-simple")
  const session = await validateSession(token)
  if (!session) return { error: "Sesi tidak valid" }
  if (!(await vp(session.username, currentPassword))) return { error: "Password saat ini salah" }

  if (!newUsername) return { error: "Username tidak boleh kosong" }
  if (!newPassword) return { error: "Password baru tidak boleh kosong" }
  if (newPassword !== confirmPassword) return { error: "Konfirmasi password tidak cocok" }
  if (newPassword.length < 4) return { error: "Password minimal 4 karakter" }

  await changeCredentials(newUsername, newPassword)
  revalidatePath("/settings")
  return { success: true }
}
