"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireRoleAction } from "@/lib/session"
import { licenseService } from "@/services/license.service"
import { ServiceError } from "@/services/member.service"
import { licenseRepository } from "@/repositories/license.repository"

type State = { error?: string; success?: boolean } | null

const dateOrEmpty = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Tanggal kadaluarsa tidak valid")

const createFamilySchema = z.object({
  familyName: z.string().trim().min(2, "Nama keluarga minimal 2 karakter").max(80),
  planType: z.enum(["basic", "family_pro", "lifetime"]),
  status: z.enum(["active", "trial"]),
  maxMembers: z.coerce.number().int().min(1).max(50),
  expiresAt: dateOrEmpty,
  adminName: z.string().trim().min(1, "Nama kepala keluarga wajib diisi").max(80),
  adminUsername: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter")
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, _ . -"),
  adminPassword: z.string().min(8, "Password minimal 8 karakter").max(256),
})

const updateLicenseSchema = z.object({
  householdId: z.string().min(1),
  planType: z.enum(["basic", "family_pro", "lifetime"]),
  status: z.enum(["active", "expired", "suspended", "trial"]),
  maxMembers: z.coerce.number().int().min(1).max(50),
  expiresAt: dateOrEmpty,
})

export async function createFamily(_prev: unknown, formData: FormData): Promise<State> {
  await requireRoleAction("super_admin")
  const parsed = createFamilySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await licenseService.createFamily(parsed.data)
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }
  revalidatePath("/super-admin")
  return { success: true }
}

export async function updateLicense(_prev: unknown, formData: FormData): Promise<State> {
  await requireRoleAction("super_admin")
  const parsed = updateLicenseSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  const used = await licenseRepository.countMembers(v.householdId)
  if (v.maxMembers < used) return { error: `Kuota tidak boleh di bawah jumlah anggota saat ini (${used})` }

  const changed = await licenseRepository.update(v.householdId, {
    plan_type: v.planType,
    status: v.status,
    max_members: v.maxMembers,
    expires_at: v.planType === "lifetime" ? null : v.expiresAt,
  })
  if (!changed) return { error: "Keluarga tidak ditemukan" }
  revalidatePath("/super-admin")
  return { success: true }
}
