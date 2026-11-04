"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { PERMISSION } from "@/lib/permissions"
import { requirePermissionAction } from "@/lib/session"
import { requireWritableUserId, resolveScope } from "@/lib/scope"
import { parsePriceCsv } from "@/lib/market/manual"
import { DATE_RE } from "@/lib/market/types"
import { MarketError, marketService, type SyncResult } from "@/services/market.service"
import { RiskError, riskService } from "@/services/risk.service"

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Input tidak valid" }
  if (err instanceof RiskError || err instanceof MarketError) return { ok: false, error: err.message }
  console.error("[simulation]", err)
  return { ok: false, error: err instanceof Error && err.message === "Forbidden" ? "Tidak punya akses" : "Terjadi kesalahan" }
}

async function readUserIds(): Promise<string[]> {
  await requirePermissionAction(PERMISSION.INVESTMENT.VIEW)
  const scope = await resolveScope()
  if (!scope) throw new Error("Forbidden")
  return scope.userIds
}

// ── Simulasi alokasi + Monte Carlo ───────────────────────────────────────────

const allocationSchema = z
  .array(z.object({ investmentId: z.string().min(1), weight: z.number().min(0).max(1) }))
  .min(1, "Pilih minimal satu aset")
  .max(20, "Maksimal 20 aset")
  .refine((a) => new Set(a.map((x) => x.investmentId)).size === a.length, "Aset tidak boleh dobel")
  .refine((a) => Math.abs(a.reduce((s, x) => s + x.weight, 0) - 1) < 0.005, "Total bobot harus 100%")

const simulationInputSchema = z
  .object({
    initialCapital: z.number().min(0).max(1e13),
    monthlyContribution: z.number().min(0).max(1e12),
    years: z.number().int().min(1, "Minimal 1 tahun").max(40, "Maksimal 40 tahun"),
    allocation: allocationSchema,
    benchmarkCode: z.string().max(32).nullish(),
    rebalance: z.enum(["NONE", "MONTHLY", "QUARTERLY", "ANNUAL"]),
    rebalanceBand: z.number().min(0).max(0.5).optional(),
    transactionCost: z.number().min(0).max(0.05).default(0.0015),
    monteCarlo: z
      .object({
        method: z.enum(["BOOTSTRAP", "GBM"]),
        iterations: z.number().int().min(100).max(5000),
        seed: z.number().int().min(0).max(2 ** 31),
        targetAmount: z.number().positive().max(1e14).nullish(),
      })
      .optional(),
  })
  .refine((v) => v.initialCapital + v.monthlyContribution > 0, "Isi modal awal atau kontribusi bulanan")

export type SimulationInput = z.input<typeof simulationInputSchema>
export type SimulationOutput = Awaited<ReturnType<typeof riskService.simulate>>

export async function runSimulation(input: unknown): Promise<ActionResult<SimulationOutput>> {
  try {
    const userIds = await readUserIds()
    const v = simulationInputSchema.parse(input)
    return { ok: true, data: await riskService.simulate(userIds, v) }
  } catch (err) {
    return fail(err)
  }
}

// ── Stress test ──────────────────────────────────────────────────────────────

const stressSchema = z.record(z.string().min(1), z.number().min(-1, "Shock minimal −100%").max(10))

export type StressOutput = Awaited<ReturnType<typeof riskService.stressTest>>

export async function runStressTest(customShocks: unknown = {}): Promise<ActionResult<StressOutput>> {
  try {
    const userIds = await readUserIds()
    return { ok: true, data: await riskService.stressTest(userIds, stressSchema.parse(customShocks ?? {})) }
  } catch (err) {
    return fail(err)
  }
}

// ── Harga aset ───────────────────────────────────────────────────────────────

async function writeCtx() {
  await requirePermissionAction(PERMISSION.INVESTMENT.UPDATE)
  const userId = await requireWritableUserId()
  return { userId, userIds: [userId] }
}

const manualPriceSchema = z.object({
  date: z.string().regex(DATE_RE, "Tanggal tidak valid"),
  close: z.coerce.number().positive("Harga harus lebih dari 0").finite(),
})

export async function addManualPrice(investmentId: string, formData: FormData): Promise<ActionResult<number>> {
  try {
    const { userIds } = await writeCtx()
    const v = manualPriceSchema.parse({ date: formData.get("date"), close: String(formData.get("close") ?? "").replace(",", ".") })
    const n = await marketService.addManualPrices(userIds, investmentId, [v])
    revalidatePath(`/investasi/aset/${investmentId}`)
    return { ok: true, data: n }
  } catch (err) {
    return fail(err)
  }
}

export async function importAssetPrices(investmentId: string, formData: FormData): Promise<ActionResult<{ imported: number; errors: string[] }>> {
  try {
    const { userIds } = await writeCtx()
    const text = String(formData.get("csv") ?? "")
    if (text.length > 400_000) throw new MarketError("Teks terlalu besar")
    const { points, errors } = parsePriceCsv(text)
    if (!points.length) throw new MarketError(errors[0] ?? "Tidak ada baris harga valid (format: YYYY-MM-DD,harga)")
    const imported = await marketService.importPrices(userIds, investmentId, points)
    revalidatePath(`/investasi/aset/${investmentId}`)
    return { ok: true, data: { imported, errors: errors.slice(0, 5) } }
  } catch (err) {
    return fail(err)
  }
}

export async function deleteAssetPrice(investmentId: string, date: string): Promise<ActionResult<null>> {
  try {
    const { userIds } = await writeCtx()
    if (!DATE_RE.test(date)) throw new MarketError("Tanggal tidak valid")
    await marketService.deletePrice(userIds, investmentId, date)
    revalidatePath(`/investasi/aset/${investmentId}`)
    return { ok: true, data: null }
  } catch (err) {
    return fail(err)
  }
}

export async function saveTicker(investmentId: string, formData: FormData): Promise<ActionResult<null>> {
  try {
    const { userId } = await writeCtx()
    const raw = String(formData.get("ticker") ?? "").trim().toUpperCase()
    await marketService.setTicker(userId, investmentId, raw || null)
    revalidatePath(`/investasi/aset/${investmentId}`)
    return { ok: true, data: null }
  } catch (err) {
    return fail(err)
  }
}

export async function syncAssetPrices(investmentId: string): Promise<ActionResult<SyncResult>> {
  try {
    const { userIds } = await writeCtx()
    const r = await marketService.syncInvestment(userIds, investmentId)
    revalidatePath(`/investasi/aset/${investmentId}`)
    return r.ok ? { ok: true, data: r } : { ok: false, error: r.error ?? "Sinkronisasi gagal" }
  } catch (err) {
    return fail(err)
  }
}

export async function syncAllPrices(): Promise<ActionResult<{ assets: SyncResult[]; benchmarks: SyncResult[] }>> {
  try {
    const { userIds } = await writeCtx()
    const [assets, benchmarks] = await Promise.all([marketService.syncScope(userIds), marketService.syncBenchmarks()])
    revalidatePath("/investasi/simulasi")
    return { ok: true, data: { assets, benchmarks } }
  } catch (err) {
    return fail(err)
  }
}
