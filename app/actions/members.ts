"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSessionAction } from "@/lib/session"
import { memberService, ServiceError } from "@/services/member.service"

type State = { error?: string; success?: boolean } | null

const addMemberSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter")
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, _ . -"),
  password: z.string().min(8, "Password minimal 8 karakter").max(256),
  role: z.enum(["member", "child"]),
  relation: z.enum(["istri", "suami", "anak"]),
  spendingLimit: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Batas belanja tidak valid"),
})

/** household_id selalu dari sesi — tidak pernah dari form (anti-IDOR). */
async function requireFamilyAdmin() {
  const session = await requireSessionAction()
  if (session.householdRole !== "admin" || !session.householdId) throw new Error("Forbidden")
  return { ...session, householdId: session.householdId }
}

export async function addMember(_prev: unknown, formData: FormData): Promise<State> {
  const session = await requireFamilyAdmin()
  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  try {
    await memberService.addMember({
      householdId: session.householdId,
      username: v.username,
      password: v.password,
      name: v.name,
      role: v.role,
      relation: v.relation,
      spendingLimit: v.spendingLimit,
    })
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }
  revalidatePath("/pengaturan/anggota")
  return { success: true }
}

export async function removeMember(formData: FormData): Promise<void> {
  const session = await requireFamilyAdmin()
  const userId = z.string().min(1).parse(formData.get("userId"))
  await memberService.removeMember(session.householdId, session.userId, userId)
  revalidatePath("/pengaturan/anggota")
}
