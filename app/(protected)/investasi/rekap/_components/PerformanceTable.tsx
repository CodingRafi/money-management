import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AssetPerformance } from "@/lib/investment-metrics"

export type PerformanceRow = AssetPerformance & { id: string; name: string; category: string }

function rp(val: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val)
}

function pct(v: number | null) {
  if (v === null || !isFinite(v)) return <span className="text-muted-foreground">—</span>
  const cls = v > 0 ? "text-emerald-600" : v < 0 ? "text-red-600" : ""
  return <span className={cls}>{v >= 0 ? "+" : ""}{(v * 100).toFixed(2)}%</span>
}

function duration(years: number) {
  if (years <= 0) return "—"
  if (years < 1) return `${Math.max(1, Math.round(years * 12))} bln`
  return `${years.toFixed(1)} thn`
}

export function PerformanceTable({ rows }: { rows: PerformanceRow[] }) {
  const modal = rows.reduce((s, r) => s + r.modal, 0)
  const total = rows.reduce((s, r) => s + r.hasil + r.dividen, 0)
  const totalReturn = modal > 0 ? (total - modal) / modal : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wide">Kinerja Aset Terealisasi</CardTitle>
        <p className="text-xs text-muted-foreground">
          Return, CAGR, dan XIRR dihitung dari aset yang sudah ditutup (hasil jual + dividen vs modal).
          Aset aktif belum dihitung karena belum ada nilai pasar.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-14 text-sm text-muted-foreground px-4 text-center">
            Belum ada aset yang ditutup. Tutup aset di halaman detailnya untuk melihat kinerjanya.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground border-y">
                  <th className="px-3 py-2 text-left font-medium">Aset</th>
                  <th className="px-3 py-2 text-right font-medium">Modal</th>
                  <th className="px-3 py-2 text-right font-medium">Hasil + Dividen</th>
                  <th className="px-3 py-2 text-right font-medium">Return</th>
                  <th className="px-3 py-2 text-right font-medium">CAGR</th>
                  <th className="px-3 py-2 text-right font-medium">XIRR</th>
                  <th className="px-3 py-2 text-right font-medium">Durasi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link href={`/investasi/aset/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                      <p className="text-xs text-muted-foreground">{r.category}</p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{rp(r.modal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rp(r.hasil + r.dividen)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{pct(r.returnPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(r.cagrPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pct(r.xirrPct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{duration(r.holdingYears)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rp(modal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{rp(total)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(totalReturn)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
