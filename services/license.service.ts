import crypto from "crypto"
import { db } from "@/lib/db"
import { licenseRepository } from "@/repositories/license.repository"
import { evaluateLicense, type LicenseState } from "@/dtos/license"
import { categoryRepository } from "@/repositories/category.repository"
import { memberService } from "@/services/member.service"

export interface NewFamilyInput {
  familyName: string
  planType: string
  status: "active" | "trial"
  maxMembers: number
  expiresAt: string | null
  adminUsername: string
  adminPassword: string
  adminName: string
}

export const licenseService = {
  async getState(householdId: string): Promise<LicenseState> {
    return evaluateLicense(await licenseRepository.findByHousehold(householdId))
  },

  /** Kuota anggota keluarga; dipakai halaman anggota & pendaftaran. */
  async memberQuota(householdId: string): Promise<{ used: number; max: number }> {
    const [license, used] = await Promise.all([
      licenseRepository.findByHousehold(householdId),
      licenseRepository.countMembers(householdId),
    ])
    return { used, max: license?.max_members ?? 0 }
  },

  /**
   * Pendaftaran keluarga baru (Bab 3.2): household → license → user admin →
   * household_members → seed kategori. Satu transaksi; gagal = rollback semua.
   */
  async createFamily(input: NewFamilyInput): Promise<{ householdId: string; adminId: string }> {
    const householdId = crypto.randomUUID()
    let adminId = ""
    await db.transaction(async () => {
      await licenseRepository.insertHousehold(householdId, input.familyName)
      await licenseRepository.insertLicense(crypto.randomUUID(), householdId, {
        plan_type: input.planType,
        status: input.status,
        max_members: input.maxMembers,
        expires_at: input.expiresAt,
      })
      adminId = await memberService.addMember({
        householdId,
        username: input.adminUsername,
        password: input.adminPassword,
        name: input.adminName,
        role: "admin",
        relation: "suami",
      })
      await categoryRepository.seedHouseholdFromTemplate(householdId)
    })
    return { householdId, adminId }
  },
}
