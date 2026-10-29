import crypto from "crypto"
import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth-simple"
import { memberRepository } from "@/repositories/member.repository"
import { licenseRepository } from "@/repositories/license.repository"
import { evaluateLicense } from "@/dtos/license"

export class ServiceError extends Error {}

export interface NewMemberInput {
  householdId: string
  username: string
  password: string
  name: string
  role: "admin" | "member" | "child"
  relation: "suami" | "istri" | "anak" | null
  spendingLimit?: number | null
}

export const memberService = {
  /** Menambah anggota dengan validasi kuota lisensi. Untuk Admin Keluarga & Super Admin. */
  async addMember(input: NewMemberInput): Promise<string> {
    const license = await licenseRepository.findByHousehold(input.householdId)
    if (!evaluateLicense(license).ok) throw new ServiceError("Lisensi keluarga tidak aktif")

    const used = await licenseRepository.countMembers(input.householdId)
    if (used >= license!.max_members) {
      throw new ServiceError(`Kuota anggota penuh (${used}/${license!.max_members})`)
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

  async removeMember(householdId: string, actorId: string, userId: string): Promise<void> {
    if (actorId === userId) throw new ServiceError("Tidak bisa menghapus akun sendiri")
    const member = await memberRepository.find(householdId, userId)
    if (!member) throw new ServiceError("Anggota tidak ditemukan")
    await memberRepository.deleteUser(userId)
  },
}
