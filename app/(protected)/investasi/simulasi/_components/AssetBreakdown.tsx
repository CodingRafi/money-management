import { Card, CardContent } from "@/components/ui/card"
import type { RiskMetrics } from "@/lib/risk/types"
import { num, pct, rp } from "@/lib/risk/format"

type Row = { investmentId: string; name: string; value: number; weight: number; metrics: RiskMetrics }

export function AssetBreakdown({ rows }: { rows: Row[] }) {
  return (
    <Card>
      <CardContent className="p-4 overflow-x-auto">
        <p className="text-sm font-semibold mb-3">Rincian per Aset</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              <th className="py-2 pr-3 font-medium">Aset</th>
              <th className="py-2 pr-3 font-medium text-right">Nilai akhir</th>
              <th className="py-2 pr-3 font-medium text-right">Bobot akhir</th>
              <th className="py-2 pr-3 font-medium text-right">Return</th>
              <th className="py-2 pr-3 font-medium text-right">Max DD</th>
              <th className="py-2 font-medium text-right">Beta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.investmentId} className="border-b last:border-0">
                <td className="py-2 pr-3">{r.name}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{rp(r.value)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.weight, 0)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.metrics.totalReturn)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{pct(r.metrics.maxDrawdown)}</td>
                <td className="py-2 text-right tabular-nums">{num(r.metrics.beta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
