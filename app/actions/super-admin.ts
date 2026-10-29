"use server"

import { revalidatePath } from "next/cache"
import crypto from "crypto"
import { z } from "zod"
import { requireSuperAdminAction, type SessionData } from "@/lib/session"
import { PERMISSION, type Permission } from "@/lib/permissions"
import { licenseService } from "@/services/license.service"
import { memberService, ServiceError } from "@/services/member.service"
import { licenseRepository } from "@/repositories/license.repository"
import { licenseEventRepository } from "@/repositories/license-event.repository"

type State = { error?: string; success?: boolean } | null

/**
 * Guard untuk seluruh aksi Super Admin: wajib role `super_admin` **dan**
 * permission-nya. Role dicek eksplisit karena resource `member` juga dipakai
 * Admin Keluarga — tanpa cek ini, Family Admin bisa menambah anggota ke
 * keluarga lain.
 */
async function guard(permission: Permission): Promise<{ ok: true; session: SessionData } | { ok: false }> {
  try {
    const session = await requireSuperAdminAction(permission)
    return { ok: true, session }
  } catch {
    return { ok: false }
  }
}

const FORBIDDEN = "Anda tidak punya akses untuk tindakan ini"

const dateOrEmpty = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Tanggal kadaluarsa tidak valid")

const priceSchema = z
  .string()
  .trim()
  .transform((v) => (v === "" ? 0 : Number(v)))
  .refine((v) => Number.isFinite(v) && v >= 0, "Harga tidak valid")

const createFamilySchema = z.object({
  familyName: z.string().trim().min(2, "Nama keluarga minimal 2 karakter").max(80),
  planType: z.enum(["basic", "family_pro", "lifetime"]),
  status: z.enum(["active", "trial"]),
  maxMembers: z.coerce.number().int().min(1).max(50),
  expiresAt: dateOrEmpty,
  price: priceSchema,
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
  price: priceSchema,
})

const addMemberSchema = z.object({
  householdId: z.string().min(1, "Keluarga wajib dipilih"),
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  username: z
    .string()
    .trim()
    .min(3, "Username minimal 3 karakter")
    .max(64)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, _ . -"),
  password: z.string().min(8, "Password minimal 8 karakter").max(256),
  role: z.enum(["admin", "member", "child"]),
  relation: z.enum(["suami", "istri", "anak"]),
  spendingLimit: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Batas belanja tidak valid"),
})

const renewSchema = z.object({
  householdId: z.string().min(1),
  months: z.coerce.number().int().min(1).max(120),
  price: priceSchema,
})

const recordSaleSchema = z.object({
  householdId: z.string().min(1),
  price: priceSchema,
  planType: z.enum(["basic", "family_pro", "lifetime"]).optional(),
})

export async function createFamily(_prev: unknown, formData: FormData): Promise<State> {
  const g = await guard(PERMISSION.FAMILY.CREATE)
  if (!g.ok) return { error: FORBIDDEN }
  const parsed = createFamilySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await licenseService.createFamily(parsed.data, g.session.userId)
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }
  revalidatePath("/super-admin")
  revalidatePath("/super-admin/licensi")
  revalidatePath("/super-admin/keluarga")
  return { success: true }
}

export async function updateLicense(_prev: unknown, formData: FormData): Promise<State> {
  const g = await guard(PERMISSION.LICENSE.UPDATE)
  if (!g.ok) return { error: FORBIDDEN }
  const parsed = updateLicenseSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  const used = await licenseRepository.countMembers(v.householdId)
  if (v.maxMembers < used) return { error: `Kuota tidak boleh di bawah jumlah anggota saat ini (${used})` }

  const before = await licenseRepository.findByHousehold(v.householdId)
  if (!before) return { error: "Keluarga tidak ditemukan" }

  const changed = await licenseRepository.update(v.householdId, {
    plan_type: v.planType,
    status: v.status,
    max_members: v.maxMembers,
    expires_at: v.planType === "lifetime" ? null : v.expiresAt,
    price: v.price,
  })
  if (!changed) return { error: "Keluarga tidak ditemukan" }

  if (before.status !== v.status) {
    await licenseEventRepository.insert({
      id: crypto.randomUUID(),
      householdId: v.householdId,
      eventType: "status_change",
      amount: 0,
      planType: v.planType,
      note: `Status: ${before.status} → ${v.status}`,
      createdBy: g.session.userId,
    })
  }

  revalidatePath("/super-admin")
  revalidatePath("/super-admin/licensi")
  revalidatePath("/super-admin/keluarga")
  return { success: true }
}

/** Tambah anggota keluarga — hak khusus Super Admin, untuk keluarga mana pun. */
export async function addMember(_prev: unknown, formData: FormData): Promise<State> {
  const g = await guard(PERMISSION.MEMBER.CREATE)
  if (!g.ok) return { error: FORBIDDEN }
  const parsed = addMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  try {
    await memberService.addMemberBySuperAdmin(
      {
        householdId: v.householdId,
        username: v.username,
        password: v.password,
        name: v.name,
        role: v.role,
        relation: v.relation,
        spendingLimit: v.spendingLimit,
      },
      g.session.userId,
    )
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }

  revalidatePath("/super-admin/keluarga")
  revalidatePath("/super-admin")
  return { success: true }
}

export async function removeMember(formData: FormData): Promise<void> {
  const g = await guard(PERMISSION.MEMBER.DELETE)
  if (!g.ok) throw new Error(FORBIDDEN)
  const householdId = z.string().min(1).parse(formData.get("householdId"))
  const userId = z.string().min(1).parse(formData.get("userId"))

  try {
    await memberService.removeMemberBySuperAdmin(householdId, g.session.userId, userId)
  } catch (err) {
    if (err instanceof ServiceError) throw new Error(err.message)
    throw err
  }
  revalidatePath("/super-admin/keluarga")
}

/**
 * Tetapkan password untuk anggota yang belum punya password
 * (mis. akun admin keluarga hasil migrasi 006).
 */
export async function setMemberPassword(_prev: unknown, formData: FormData): Promise<State> {
  const g = await guard(PERMISSION.MEMBER.UPDATE)
  if (!g.ok) return { error: FORBIDDEN }
  const parsed = z
    .object({
      householdId: z.string().min(1),
      userId: z.string().min(1),
      password: z.string().min(8, "Password minimal 8 karakter").max(256),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  try {
    await memberService.setPassword(parsed.data.householdId, parsed.data.userId, parsed.data.password)
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }

  revalidatePath("/super-admin/keluarga")
  return { success: true }
}

/** Perpanjang lisensi keluarga (renewal) + catat transaksi. */
export async function renewLicense(_prev: unknown, formData: FormData): Promise<State> {
  const g = await guard(PERMISSION.LICENSE.UPDATE)
  if (!g.ok) return { error: FORBIDDEN }
  const parsed = renewSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  try {
    await licenseService.extendLicense(v.householdId, v.months, {
      price: v.price > 0 ? v.price : undefined,
      actorId: g.session.userId,
    })
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }

  revalidatePath("/super-admin")
  revalidatePath("/super-admin/licensi")
  revalidatePath("/super-admin/keluarga")
  return { success: true }
}

/** Catat penjualan lisensi (harga + tanggal jual). */
export async function recordSale(_prev: unknown, formData: FormData): Promise<State> {
  const g = await guard(PERMISSION.LICENSE.UPDATE)
  if (!g.ok) return { error: FORBIDDEN }
  const parsed = recordSaleSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const v = parsed.data

  try {
    await licenseService.recordSale(v.householdId, v.price, {
      planType: v.planType,
      actorId: g.session.userId,
    })
  } catch (err) {
    if (err instanceof ServiceError) return { error: err.message }
    throw err
  }

  revalidatePath("/super-admin")
  revalidatePath("/super-admin/licensi")
  return { success: true }
}
