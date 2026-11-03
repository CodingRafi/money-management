import { Card, CardContent } from "@/components/ui/card"
import type { RiskMetrics } from "@/lib/risk/types"
import { num, pct } from "@/lib/risk/format"

const HINTS: Record<string, string> = {
  TWR: "Return murni portofolio, tidak terpengaruh setoran/penarikan",
  CAGR: "Pertumbuhan rata-rata per tahun (majemuk)",
  "Max Drawdown": "Penurunan terdalam dari puncak ke lembah",
  Volatilitas: "Fluktuasi return, disetahunkan",
  Sharpe: "Return per unit risiko (makin tinggi makin baik)",
  Sortino: "Seperti Sharpe, hanya menghitung risiko penurunan",
  "VaR 95%": "Kerugian bulanan yang dilampaui hanya di 5% bulan terburuk",
  "CVaR 95%": "Rata-rata kerugian pada 5% bulan terburuk",
  Beta: "Sensitivitas terhadap benchmark (1 = bergerak sama)",
}

export function MetricsCards({ metrics, benchmark }: { metrics: RiskMetrics; benchmark?: RiskMetrics | null }) {
  const items: { label: string; value: string; bench?: string }[] = [
    { label: "TWR", value: pct(metrics.twr), bench: benchmark ? pct(benchmark.twr) : undefined },
    { label: "CAGR", value: pct(metrics.cagr), bench: benchmark ? pct(benchmark.cagr) : undefined },
    { label: "Max Drawdown", value: pct(metrics.maxDrawdown), bench: benchmark ? pct(benchmark.maxDrawdown) : undefined },
    { label: "Volatilitas", value: pct(metrics.volatility), bench: benchmark ? pct(benchmark.volatility) : undefined },
    { label: "Sharpe", value: num(metrics.sharpe), bench: benchmark ? num(benchmark.sharpe) : undefined },
    { label: "Sortino", value: num(metrics.sortino), bench: benchmark ? num(benchmark.sortino) : undefined },
    { label: "VaR 95%", value: pct(metrics.var95), bench: benchmark ? pct(benchmark.var95) : undefined },
    { label: "CVaR 95%", value: pct(metrics.cvar95), bench: benchmark ? pct(benchmark.cvar95) : undefined },
    ...(metrics.beta != null ? [{ label: "Beta", value: num(metrics.beta) }] : []),
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <Card key={it.label} title={HINTS[it.label]}>
          <CardContent className="p-3">
            <p className="text-[11px] text-muted-foreground">{it.label}</p>
            <p className="text-lg font-bold tabular-nums">{it.value}</p>
            {it.bench !== undefined && <p className="text-[10px] text-muted-foreground">Benchmark: {it.bench}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
