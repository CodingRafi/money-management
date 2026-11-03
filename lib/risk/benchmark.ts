import type { NavPoint } from "./types"
import { alignSeries, fillMonthly, monthKey } from "./returns"

export const BENCHMARKS: { code: string; label: string; yahoo: string }[] = [
  { code: "IHSG", label: "IHSG (indeks saham)", yahoo: "^JKSE" },
  { code: "GOLD", label: "Emas (USD)", yahoo: "GC=F" },
  { code: "OBLIGASI_ID", label: "Obligasi pemerintah RI", yahoo: "" },
]

export function benchmarkLabel(code: string): string {
  return BENCHMARKS.find((b) => b.code === code)?.label ?? code
}

/** Benchmark bulanan, diisi carry-forward dan dipotong ke tanggal portofolio. */
export function alignBenchmark(portfolio: NavPoint[], benchmark: NavPoint[]): NavPoint[] {
  if (!portfolio.length || !benchmark.length) return []
  const last = monthKey(portfolio[portfolio.length - 1].date)
  const filled = fillMonthly(benchmark, last)
  return alignSeries(portfolio, filled).b
}
