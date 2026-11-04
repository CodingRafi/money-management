import { Card, CardContent } from "@/components/ui/card"
import { movingAverage } from "@/lib/risk/returns"
import { num, pct, rp } from "@/lib/risk/format"
import { priceRepository } from "@/repositories/price.repository"
import { riskService } from "@/services/risk.service"
import { PriceChart } from "./PriceChart"
import { DeletePriceButton, PriceForms } from "./PriceForms"

/** Harga historis, tombol sync, dan mini-metrik risiko untuk satu aset (server component). */
export async function PriceSection({ investmentId, userId, canEdit }: { investmentId: string; userId: string; canEdit: boolean }) {
  const inv = await priceRepository.findInvestment(investmentId, [userId])
  if (!inv) return null
  const mini = await riskService.assetMiniMetrics([userId], investmentId)
  const daily = mini?.daily ?? []
  const closes = daily.map((p) => p.value)
  const ma50 = movingAverage(closes, 50)
  const ma200 = movingAverage(closes, 200)
  const chart = daily.map((p, i) => ({ date: p.date, close: p.value, ma50: ma50[i], ma200: ma200[i] }))
  const recent = [...daily].reverse().slice(0, 8)
  const m = mini?.metrics
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Harga &amp; Risiko</h2>

      {m && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Mini label="Volatilitas" value={pct(m.volatility)} />
          <Mini label="Max Drawdown" value={pct(m.maxDrawdown)} />
          <Mini label="Sharpe" value={num(m.sharpe)} />
          <Mini label="Beta vs IHSG" value={num(m.beta)} />
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          {chart.length >= 2 ? (
            <PriceChart data={chart} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Belum ada harga historis untuk aset ini. Isi ticker lalu Sync, atau input manual / impor CSV di bawah.
              Tanpa harga, aset dinilai dari harga transaksi terakhir.
            </p>
          )}
          {canEdit && <PriceForms investmentId={investmentId} ticker={inv.ticker} today={today} />}
          {recent.length > 0 && (
            <div className="text-xs">
              <p className="font-medium text-muted-foreground mb-1">Harga terakhir ({mini?.pricePoints} titik)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                {recent.map((p) => (
                  <div key={p.date} className="flex items-center justify-between border-b py-0.5">
                    <span className="text-muted-foreground tabular-nums">{p.date}</span>
                    <span className="tabular-nums">{rp(p.value)}</span>
                    {canEdit ? <DeletePriceButton investmentId={investmentId} date={p.date} /> : <span className="w-6" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </CardContent></Card>
  )
}
