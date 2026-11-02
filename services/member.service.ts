import crypto from "crypto"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth-simple"
import { memberRepository } from "@/repositories/member.repository"
import { licenseRepository } from "@/repositories/license.repository"
import { licenseEventRepository } from "@/repositories/license-event.repository"
import { evaluateLicense } from "@/dtos/license"
import type { UserRole } from "@/lib/auth-simple"

export class ServiceError extends Error {}

export interface NewMemberInput {
  householdId: string
  username: string
  password: string
  name: string
  role: "admin" | "member" | "child"
  relation: "suami" | "istri" | "anak" | null
  spendingLimit?: number | null
  /**
   * Super Admin boleh menambah anggota walau lisensi keluarga sedang
   * expired/suspended (justru itu tugasnya mengelola lisensi).
   */
  ignoreLicenseState?: boolean
  /**
   * Peran pelaku. Penambahan anggota HANYA boleh dilakukan `super_admin`;
   * kepala keluarga (admin) tidak boleh menambah anggota.
   */
  actorRole: UserRole
}

export const memberService = {
  /**
   * Menambah anggota dengan validasi kuota lisensi.
   *
   * Hanya Super Admin yang boleh menambah anggota —-see {@link NewMemberInput.actorRole}.
   */
  async addMember(input: NewMemberInput): Promise<string> {
    if (input.actorRole !== "super_admin") {
      throw new ServiceError("Hanya pengelola aplikasi (Super Admin) yang dapat menambah anggota")
    }
    const license = await licenseRepository.findByHousehold(input.householdId)
    if (!license) throw new ServiceError("Lisensi keluarga tidak ditemukan")
    if (!input.ignoreLicenseState && !evaluateLicense(license).ok) {
      throw new ServiceError("Lisensi keluarga tidak aktif")
    }

    const used = await licenseRepository.countMembers(input.householdId)
    if (used >= license.max_members) {
      throw new ServiceError(`Kuota anggota penuh (${used}/${license.max_members})`)
    }

    if (await memberRepository.usernameExists(input.username)) {
      throw new ServiceError("Username sudah dipakai")
    }

    const userId = crypto.randomUUID()
    const passwordHash = await hashPassword(input.password)
    await db.transaction(async () => {
      await memberRepository.insertUser({
        id: userId,
        username: input.username,
        name: input.name,
        email: `${userId}@members.local`,
        passwordHash,
        role: input.role,
        relation: input.relation,
      })
      await memberRepository.insertMember({
        householdId: input.householdId,
        userId,
        role: input.role,
        relation: input.relation,
        spendingLimit: input.role === "child" ? (input.spendingLimit ?? null) : null,
      })
    })
    return userId
  },

  /**
   * Tambah anggota oleh Super Admin untuk keluarga mana pun.
   * household_id divalidasi (wajib ada) sebelum dipakai.
   */
  async addMemberBySuperAdmin(
    input: Omit<NewMemberInput, "ignoreLicenseState" | "actorRole">,
    actorId: string,
  ): Promise<string> {
    const household = await licenseRepository.findHousehold(input.householdId)
    if (!household) throw new ServiceError("Keluarga tidak ditemukan")

    const userId = await memberService.addMember({
      ...input,
      ignoreLicenseState: true,
      actorRole: "super_admin",
    })

    await licenseEventRepository.insert({
      id: crypto.randomUUID(),
      householdId: input.householdId,
      eventType: "member_change",
      amount: 0,
      note: `Anggota baru: ${input.name} (${input.username})`,
      createdBy: actorId,
    })
    return userId
  },

  async removeMember(householdId: string, actorId: string, userId: string): Promise<void> {
    if (actorId === userId) throw new ServiceError("Tidak bisa menghapus akun sendiri")
    const member = await memberRepository.find(householdId, userId)
    if (!member) throw new ServiceError("Anggota tidak ditemukan")
    await memberRepository.deleteUser(userId)
  },

  /** Hapus anggota oleh Super Admin (boleh dari keluarga mana pun). */
  async removeMemberBySuperAdmin(
    householdId: string,
    actorId: string,
    userId: string,
  ): Promise<void> {
    const household = await licenseRepository.findHousehold(householdId)
    if (!household) throw new ServiceError("Keluarga tidak ditemukan")
    await memberService.removeMember(householdId, actorId, userId)

    await licenseEventRepository.insert({
      id: crypto.randomUUID(),
      householdId,
      eventType: "member_change",
      amount: 0,
      note: "Anggota dihapus",
      createdBy: actorId,
    })
  },

  /** Ubah batas belanja bulanan (khusus peran anak). */
  async updateSpendingLimit(
    householdId: string,
    userId: string,
    limit: number | null,
  ): Promise<number> {
    return await memberRepository.updateSpendingLimit(householdId, userId, limit)
  },

  /** Tetapkan password anggota (dipakai Super Admin untuk akun tanpa password). */
  async setPassword(householdId: string, userId: string, password: string): Promise<void> {
    const member = await memberRepository.find(householdId, userId)
    if (!member) throw new ServiceError("Anggota tidak ditemukan")
    const changed = await memberRepository.setPassword(userId, await hashPassword(password))
    if (!changed) throw new ServiceError("Gagal menyimpan password")
  },
}
