import crypto from "crypto"
import { db } from "@/lib/db"
import { licenseRepository, type HouseholdSummaryRow } from "@/repositories/license.repository"
import { licenseEventRepository, type LicenseEventWithHousehold } from "@/repositories/license-event.repository"
import { evaluateLicense, type LicenseState } from "@/dtos/license"
import { categoryRepository } from "@/repositories/category.repository"
import { memberService } from "@/services/member.service"

export interface NewFamilyInput {
  familyName: string
  planType: string
  status: "active" | "trial"
  maxMembers: number
  expiresAt: string | null
  /** Nilai jual lisensi dalam IDR (0 = belum ada transaksi tercatat). */
  price: number
  adminUsername: string
  adminPassword: string
  adminName: string
}

export interface MonitoringSnapshot {
  households: number
  members: number
  byStatus: { active: number; trial: number; expired: number; suspended: number }
  revenue: number
  revenueByPlan: { plan_type: string; households: number; revenue: number }[]
  /** Segera kadaluarsa dalam 30 hari. */
  expiring: HouseholdSummaryRow[]
  /** Sudah kadaluarsa / ditangguhkan. */
  expired: HouseholdSummaryRow[]
  recentEvents: LicenseEventWithHousehold[]
}

/** Berapa hari ke depan lisensi dianggap "segera kadaluarsa". */
export const EXPIRING_SOON_DAYS = 30

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
   * household_members → seed kategori → catat penjualan. Satu transaksi;
   * gagal = rollback semua.
   */
  async createFamily(input: NewFamilyInput, actorId?: string | null): Promise<{ householdId: string; adminId: string }> {
    const householdId = crypto.randomUUID()
    let adminId = ""
    await db.transaction(async () => {
      await licenseRepository.insertHousehold(householdId, input.familyName)
      await licenseRepository.insertLicense(crypto.randomUUID(), householdId, {
        plan_type: input.planType,
        status: input.status,
        max_members: input.maxMembers,
        expires_at: input.expiresAt,
        price: input.price,
      })
      adminId = await memberService.addMember({
        householdId,
        username: input.adminUsername,
        password: input.adminPassword,
        name: input.adminName,
        role: "admin",
        relation: "suami",
        ignoreLicenseState: true,
        actorRole: "super_admin",
      })
      await categoryRepository.seedHouseholdFromTemplate(householdId)
      await licenseEventRepository.insert({
        id: crypto.randomUUID(),
        householdId,
        eventType: "sale",
        amount: input.price,
        planType: input.planType,
        note: "Pendaftaran keluarga baru",
        createdBy: actorId ?? null,
      })
    })
    return { householdId, adminId }
  },

  /** Perpanjang lisensi + catat transaksi renewal. */
  async extendLicense(
    householdId: string,
    months: number,
    opts: { price?: number; note?: string; actorId?: string | null } = {},
  ): Promise<void> {
    const license = await licenseRepository.findByHousehold(householdId)
    if (!license) throw new Error("Keluarga tidak ditemukan")

    const base = license.expires_at && new Date(license.expires_at) > new Date()
      ? new Date(license.expires_at)
      : new Date()
    base.setMonth(base.getMonth() + months)
    const expiresAt = base.toISOString()

    await db.transaction(async () => {
      await licenseRepository.renew(householdId, expiresAt, opts.price)
      await licenseEventRepository.insert({
        id: crypto.randomUUID(),
        householdId,
        eventType: "renewal",
        amount: opts.price ?? 0,
        planType: license.plan_type,
        note: opts.note ?? `Perpanjangan ${months} bulan`,
        createdBy: opts.actorId ?? null,
      })
    })
  },

  /** Catat transaksi penjualan (harga baru) pada lisensi keluarga. */
  async recordSale(
    householdId: string,
    price: number,
    opts: { planType?: string; note?: string; actorId?: string | null } = {},
  ): Promise<void> {
    const license = await licenseRepository.findByHousehold(householdId)
    if (!license) throw new Error("Keluarga tidak ditemukan")

    await db.transaction(async () => {
      await licenseRepository.recordSale(householdId, price, opts.planType)
      await licenseEventRepository.insert({
        id: crypto.randomUUID(),
        householdId,
        eventType: "sale",
        amount: price,
        planType: opts.planType ?? license.plan_type,
        note: opts.note ?? "Penjualan lisensi",
        createdBy: opts.actorId ?? null,
      })
    })
  },

  /** Ringkasan untuk dashboard monitoring Super Admin. */
  async monitoring(): Promise<MonitoringSnapshot> {
    const [byStatus, revenue, revenueByPlan, members, expiring, expired, recentEvents, households] =
      await Promise.all([
        licenseRepository.statusCounts(),
        licenseRepository.totalRevenue(),
        licenseRepository.revenueByPlan(),
        licenseRepository.countAllMembers(),
        licenseRepository.listExpiring(EXPIRING_SOON_DAYS),
        licenseRepository.listExpired(),
        licenseEventRepository.listRecent(20),
        licenseRepository.listHouseholds(),
      ])

    return {
      households: households.length,
      members,
      byStatus,
      revenue,
      revenueByPlan,
      expiring,
      expired,
      recentEvents,
    }
  },
}
