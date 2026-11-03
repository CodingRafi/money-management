import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { MetricsCards } from "../../simulasi/_components/MetricsCards"
import { DrawdownChart } from "./DrawdownChart"
import { num, pct, rp } from "@/lib/risk/format"
import { benchmarkLabel } from "@/lib/risk/benchmark"
import type { PortfolioRisk } from "@/services/risk.service"

/** Warna sel heatmap: merah = korelasi positif tinggi (diversifikasi buruk), biru = negatif. */
function cellColor(v: number | null): string {
  if (v == null) return "transparent"
  const a = Math.min(1, Math.abs(v)) * 0.65
  return v >= 0 ? `rgba(239,68,68,${a})` : `rgba(59,130,246,${a})`
}

export function RiskSection({ risk }: { risk: PortfolioRisk }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Risiko Portofolio</h2>
          <p className="text-sm text-muted-foreground">
            Dihitung dari nilai pasar bulanan, bersih dari setoran/penarikan (time-weighted)
            {risk.benchmarkCode ? ` · benchmark ${benchmarkLabel(risk.benchmarkCode)}` : ""}
          </p>
        </div>
        <Link href="/investasi/simulasi" className="text-sm text-primary underline underline-offset-2 shrink-0">Simulasi &amp; stress test →</Link>
      </div>

      {!risk.hasData ? (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">
          Belum cukup data untuk metrik risiko (butuh transaksi minimal 2 bulan). Tambahkan harga pasar di halaman aset agar nilai portofolio akurat.
        </CardContent></Card>
      ) : (
        <>
          {risk.concentration.warnings.map((w) => (
            <div key={w} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{w}</span>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Nilai portofolio (estimasi)</p><p className="text-lg font-bold tabular-nums">{rp(risk.currentValue)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Modal bersih disetor</p><p className="text-lg font-bold tabular-nums">{rp(risk.netInvested)}</p></CardContent></Card>
          </div>

          <MetricsCards metrics={risk.metrics} benchmark={risk.benchmarkMetrics} />

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">Drawdown dari Puncak</p>
              <DrawdownChart data={risk.drawdown} />
            </CardContent>
          </Card>

          {risk.correlation.keys.length >= 2 && (
            <Card>
              <CardContent className="p-4 overflow-x-auto">
                <p className="text-sm font-semibold mb-1">Korelasi Antar Aset</p>
                <p className="text-xs text-muted-foreground mb-3">Merah = bergerak searah (diversifikasi lemah), biru = berlawanan</p>
                <div className="inline-grid gap-px text-[11px]" style={{ gridTemplateColumns: `120px repeat(${risk.correlation.keys.length}, 56px)` }}>
                  <div />
                  {risk.correlation.keys.map((k) => <div key={k} className="truncate text-center text-muted-foreground px-1" title={k}>{k}</div>)}
                  {risk.correlation.matrix.map((row, i) => (
                    <div key={risk.correlation.keys[i]} className="contents">
                      <div className="truncate pr-2 text-muted-foreground" title={risk.correlation.keys[i]}>{risk.correlation.keys[i]}</div>
                      {row.map((v, j) => (
                        <div key={j} className="h-9 flex items-center justify-center tabular-nums rounded-sm" style={{ background: cellColor(v) }}>{v == null ? "—" : v.toFixed(2)}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 overflow-x-auto">
              <p className="text-sm font-semibold mb-3">Risiko per Aset</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Aset</th>
                    <th className="py-2 pr-3 font-medium text-right">Bobot</th>
                    <th className="py-2 pr-3 font-medium text-right">Volatilitas</th>
                    <th className="py-2 pr-3 font-medium text-right">Max DD</th>
                    <th className="py-2 pr-3 font-medium text-right">Sharpe</th>
                    <th className="py-2 font-medium text-right">Beta</th>
                  </tr>
                </thead>
                <tbody>
                  {risk.perAsset.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">{a.name}{!a.hasPrices && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">data parsial</span>}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(a.weight, 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(a.metrics?.volatility)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{pct(a.metrics?.maxDrawdown)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{num(a.metrics?.sharpe)}</td>
                      <td className="py-2 text-right tabular-nums">{num(a.metrics?.beta)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {risk.missingData.length > 0 && (
                <ul className="mt-3 text-[11px] text-muted-foreground list-disc pl-4">{risk.missingData.map((m) => <li key={m}>{m}</li>)}</ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
