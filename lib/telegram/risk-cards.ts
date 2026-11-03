import { escapeHtml, formatAmount } from "./format"
import { num, pct } from "@/lib/risk/format"
import type { PortfolioRisk } from "@/services/risk.service"
import type { SimulationResult } from "@/lib/risk/simulation"
import type { StressResult } from "@/lib/risk/stress"

const DISCLAIMER = "<i>Simulasi berdasarkan data historis &amp; asumsi, bukan nasihat investasi.</i>"

/** Kartu ringkasan risiko portofolio (HTML Telegram). */
export function riskCard(r: PortfolioRisk): string {
  if (!r.hasData) return "Belum cukup data untuk menghitung risiko portofolio (butuh transaksi investasi minimal 2 bulan)."
  const m = r.metrics
  const lines = [
    "📊 <b>Risiko Portofolio</b>",
    `Nilai estimasi: <b>${formatAmount(r.currentValue)}</b> · modal bersih ${formatAmount(r.netInvested)}`,
    "",
    `📈 TWR: <b>${pct(m.twr)}</b> · CAGR: <b>${pct(m.cagr)}</b>`,
    `📉 Max Drawdown: <b>${pct(m.maxDrawdown)}</b> (saat ini ${pct(m.currentDrawdown)})`,
    `🌊 Volatilitas: <b>${pct(m.volatility)}</b> · Sharpe: <b>${num(m.sharpe)}</b> · Sortino: <b>${num(m.sortino)}</b>`,
    `⚠️ VaR 95% bulanan: <b>${pct(m.var95)}</b> · CVaR: <b>${pct(m.cvar95)}</b>`,
  ]
  if (m.beta != null) lines.push(`🔗 Beta vs ${escapeHtml(r.benchmarkCode ?? "benchmark")}: <b>${num(m.beta)}</b> · korelasi ${num(m.correlation)}`)
  for (const w of r.concentration.warnings) lines.push("", `🚨 ${escapeHtml(w)}`)
  if (r.missingData.length) lines.push("", `<i>Data parsial: ${r.missingData.length} aset belum punya harga pasar.</i>`)
  return lines.join("\n")
}

export function simulationCard(
  s: SimulationResult,
  p: { initialCapital: number; monthlyContribution: number; years: number; labels: string[] },
): string {
  if (!s.series.length) {
    return `Simulasi belum bisa dijalankan.\n${s.assumptions.missingData.map((m) => `• ${escapeHtml(m)}`).join("\n")}`
  }
  const last = s.series[s.series.length - 1]
  const gain = last.portfolio - last.contributions
  const m = s.metrics
  const lines = [
    "🧪 <b>Simulasi Alokasi</b>",
    `Alokasi: ${escapeHtml(p.labels.join(", "))}`,
    `Modal ${formatAmount(p.initialCapital)} + ${formatAmount(p.monthlyContribution)}/bln · periode data ${s.assumptions.months} bulan`,
    "",
    `💰 Nilai akhir: <b>${formatAmount(last.portfolio)}</b> (disetor ${formatAmount(last.contributions)})`,
    `${gain >= 0 ? "✅" : "🔻"} Hasil: <b>${gain >= 0 ? "+" : "-"}${formatAmount(Math.abs(gain))}</b>`,
    `📈 CAGR: <b>${pct(m.cagr)}</b> · Max DD: <b>${pct(m.maxDrawdown)}</b> · Sharpe: <b>${num(m.sharpe)}</b>`,
  ]
  if (last.benchmark != null) lines.push(`🏁 Benchmark: ${formatAmount(last.benchmark)} (CAGR ${pct(s.benchmarkMetrics?.cagr)})`)
  for (const w of s.assumptions.missingData) lines.push(`⚠️ ${escapeHtml(w)}`)
  lines.push("", DISCLAIMER)
  return lines.join("\n")
}

export function stressCard(results: StressResult[]): string {
  if (!results.length || results[0].baseValue <= 0) return "Belum ada posisi aktif untuk di-stress test."
  const lines = ["🧯 <b>Stress Test Portofolio</b>", `Nilai sekarang: <b>${formatAmount(results[0].baseValue)}</b>`, ""]
  for (const r of results) {
    lines.push(
      `• ${escapeHtml(r.name)}: <b>${pct(r.changePct)}</b> → ${formatAmount(r.stressedValue)}` +
        ` · dampak ${r.impactScore}/5${r.recoveryMonths ? ` · pulih ±${r.recoveryMonths} bln` : ""}`,
    )
  }
  lines.push("", DISCLAIMER)
  return lines.join("\n")
}
