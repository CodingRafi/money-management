import Link from "next/link"
import { AlertTriangle, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { riskService } from "@/services/risk.service"
import { num, pct } from "@/lib/risk/format"

/**
 * Ringkasan risiko portofolio untuk dashboard. Gagal hitung (mis. migrasi harga
 * belum jalan) → kartu disembunyikan, tidak menjatuhkan dashboard.
 */
export async function PortfolioRiskCard({ userIds }: { userIds: string[] }) {
  const risk = await riskService.portfolioRisk(userIds).catch((err) => {
    console.error("[dashboard] risiko portofolio gagal:", err)
    return null
  })
  if (!risk || !risk.hasData) return null
  const m = risk.metrics

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Risiko Portofolio</CardTitle>
          <Link href="/investasi/rekap" className="text-xs text-muted-foreground hover:text-foreground flex items-center">
            Detail <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Max Drawdown" value={pct(m.maxDrawdown)} />
          <Stat label="Volatilitas" value={pct(m.volatility)} />
          <Stat label="Sharpe" value={num(m.sharpe)} />
        </div>
        {risk.concentration.warnings.slice(0, 2).map((w) => (
          <div key={w} className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{w}</span>
          </div>
        ))}
        <Link href="/investasi/simulasi" className="block text-xs text-primary underline underline-offset-2">
          Coba simulasi alokasi &amp; stress test →
        </Link>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}
