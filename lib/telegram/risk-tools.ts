import { z } from "zod"
import { hasPermission, PERMISSION } from "@/lib/permissions"
import { riskService } from "@/services/risk.service"
import type { GeminiTool } from "./gemini"
import type { ToolContext, ToolResult } from "./tools"
import { resolveTgScope } from "./scope"
import { riskCard, simulationCard, stressCard } from "./risk-cards"

/**
 * Tool Telegram untuk fitur risiko & simulasi investasi. Dipisah dari tools.ts
 * supaya file utama tidak membengkak; didaftarkan lewat spread di tools.ts.
 */

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>

const S = (description: string) => ({ type: "STRING" as const, description })
const N = (description: string) => ({ type: "NUMBER" as const, description })
const I = (description: string) => ({ type: "INTEGER" as const, description })

export const riskToolDeclarations: GeminiTool["functionDeclarations"] = [
  {
    name: "get_portfolio_risk",
    description:
      "Ringkasan risiko portofolio investasi: TWR, CAGR, max drawdown, volatilitas, Sharpe, Sortino, VaR, beta, dan peringatan konsentrasi.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "run_simulation",
    description:
      "Simulasi backtest alokasi investasi dengan data harga historis. Alokasi berupa teks 'nama aset persen' dipisah koma, mis. 'BBRI 60, Emas 40'. Bila alokasi kosong, dipakai bobot rata untuk semua aset yang punya data harga.",
    parameters: {
      type: "OBJECT",
      properties: {
        initial_capital: N("Modal awal dalam rupiah"),
        monthly_contribution: N("Setoran bulanan dalam rupiah"),
        years: I("Horizon tahun (1-40)"),
        allocation: S("Alokasi, mis. 'BBRI 60, Emas 40'"),
        benchmark: S("Kode benchmark: IHSG atau GOLD (opsional)"),
        rebalance: S("NONE, MONTHLY, QUARTERLY, atau ANNUAL (default ANNUAL)"),
      },
      required: ["initial_capital", "years"],
    },
  },
  {
    name: "get_stress_test",
    description: "Stress test portofolio saat ini terhadap skenario krisis (2008, COVID, kenaikan suku bunga, pelemahan rupiah, krisis likuiditas).",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
]

function assertView(ctx: ToolContext) {
  if (!hasPermission(ctx.session.role, PERMISSION.INVESTMENT.VIEW)) throw new Error("Akun ini tidak punya akses ke data investasi.")
}

const simArgs = z.object({
  initial_capital: z.coerce.number().min(0).max(1e13),
  monthly_contribution: z.coerce.number().min(0).max(1e12).default(0),
  years: z.coerce.number().int().min(1).max(40),
  allocation: z.string().trim().optional(),
  benchmark: z.string().trim().toUpperCase().optional(),
  rebalance: z.enum(["NONE", "MONTHLY", "QUARTERLY", "ANNUAL"]).default("ANNUAL"),
})

export const riskHandlers: Record<string, Handler> = {
  async get_portfolio_risk(_args, ctx) {
    assertView(ctx)
    const scope = await resolveTgScope(ctx.session)
    const risk = await riskService.portfolioRisk(scope.userIds)
    return {
      ok: true,
      message: riskCard(risk),
      data: { has_data: risk.hasData, warnings: risk.concentration.warnings },
    }
  },

  async run_simulation(raw, ctx) {
    assertView(ctx)
    const a = simArgs.parse(raw)
    if (a.initial_capital + a.monthly_contribution <= 0) throw new Error("Isi modal awal atau setoran bulanan.")
    const scope = await resolveTgScope(ctx.session)
    const context = await riskService.simulationContext(scope.userIds)
    if (!context.assets.length) throw new Error("Belum ada aset dengan data harga historis (min. 3 bulan). Isi harga di halaman aset.")

    // Cocokkan nama aset → id (kecocokan nama persis diutamakan, lalu "mengandung").
    let allocation: { investmentId: string; weight: number }[] = []
    const labels: string[] = []
    if (a.allocation) {
      const parts = a.allocation.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)
      for (const part of parts) {
        const m = /^(.*?)[\s:=]+(\d+(?:[.,]\d+)?)\s*%?$/.exec(part)
        if (!m) throw new Error(`Format alokasi tidak dikenali: "${part}". Contoh: 'BBRI 60, Emas 40'`)
        const name = m[1].trim().toLowerCase()
        const weight = parseFloat(m[2].replace(",", ".")) / 100
        const hits = context.assets.filter((x) => x.name.toLowerCase() === name)
        const found = hits.length ? hits : context.assets.filter((x) => x.name.toLowerCase().includes(name))
        if (found.length !== 1) {
          throw new Error(found.length ? `Nama "${m[1]}" ambigu: ${found.map((f) => f.name).join(", ")}` : `Aset "${m[1]}" tidak ditemukan / belum punya data harga.`)
        }
        allocation.push({ investmentId: found[0].id, weight })
        labels.push(`${found[0].name} ${Math.round(weight * 100)}%`)
      }
      const total = allocation.reduce((s, x) => s + x.weight, 0)
      if (Math.abs(total - 1) > 0.005) throw new Error(`Total alokasi ${Math.round(total * 100)}%, harus 100%.`)
    } else {
      allocation = context.assets.map((x) => ({ investmentId: x.id, weight: 1 / context.assets.length }))
      labels.push(...context.assets.map((x) => `${x.name} ${Math.round(100 / context.assets.length)}%`))
    }

    const bench = a.benchmark && context.benchmarks.includes(a.benchmark) ? a.benchmark : context.benchmarks[0] ?? null
    const { simulation } = await riskService.simulate(scope.userIds, {
      initialCapital: a.initial_capital,
      monthlyContribution: a.monthly_contribution,
      years: a.years,
      allocation,
      benchmarkCode: bench,
      rebalance: a.rebalance,
    })
    return {
      ok: true,
      message: simulationCard(simulation, { initialCapital: a.initial_capital, monthlyContribution: a.monthly_contribution, years: a.years, labels }),
      data: { months: simulation.assumptions.months, final_value: simulation.series.at(-1)?.portfolio ?? null },
    }
  },

  async get_stress_test(_args, ctx) {
    assertView(ctx)
    const scope = await resolveTgScope(ctx.session)
    const { results } = await riskService.stressTest(scope.userIds)
    return { ok: true, message: stressCard(results), data: { scenarios: results.map((r) => ({ code: r.code, change_pct: r.changePct })) } }
  },
}

