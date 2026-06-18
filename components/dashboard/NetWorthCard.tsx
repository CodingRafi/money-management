import { Card, CardContent } from "@/components/ui/card"
import { getWealthOverview } from "@/lib/dashboard"
import { WealthCharts } from "./WealthCharts"

function EmergencyGauge({ months, avgExpense }: { months: number; avgExpense: number }) {
  const target = 6
  const pct    = Math.min(months / target, 1)
  const r = 32; const cx = 40; const cy = 40
  const circ = 2 * Math.PI * r
  const dash = pct * circ
  const color  = months >= 6 ? "#10b981" : months >= 3 ? "#f59e0b" : "#ef4444"
  const status = months >= 6 ? "AMAN" : months >= 3 ? "CUKUP" : "KURANG"
  return (
    <div className="flex items-center gap-4 border-t border-border mt-4 pt-3">
      <div className="relative shrink-0">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="7" stroke="#e5e7eb" />
          <circle
            cx={cx} cy={cy} r={r} fill="none" strokeWidth="7"
            stroke={color}
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold tabular-nums leading-none" style={{ color }}>{months.toFixed(1)}</span>
          <span className="text-[9px] text-muted-foreground leading-none mt-0.5">bulan</span>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Dana Darurat (liquid)</p>
        <p className="text-sm font-bold" style={{ color }}>{status}
          <span className="text-xs font-normal text-muted-foreground ml-1">(avg pengeluaran: {formatRp(avgExpense)})</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Target {target} bulan · kini {months.toFixed(1)} bulan</p>
        <div className="mt-1.5 h-1.5 w-full max-w-[120px] bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  )
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

export async function NetWorthSection({ userId, year }: { userId: string; year: number }) {
  const data = getWealthOverview(userId, year)

  const totalKekayaanDenganPiutang = data.totalKekayaan + data.piutangSisa
  const totalKekayaanRealistis     = data.totalKekayaan + data.piutangSisa - data.piutangMacetSisa

  return (
    <>
      <Card>
        <CardContent className="p-6">
          {/* Total Kekayaan */}
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Total Kekayaan
          </p>
          <p className="text-3xl font-bold tabular-nums mb-4">{formatRp(data.totalKekayaan)}</p>

          <div className="flex flex-wrap gap-6 mb-5">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Dompet</p>
              <p className="text-sm font-semibold tabular-nums text-blue-600">{formatRp(data.totalDompet)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Investasi</p>
              <p className="text-sm font-semibold tabular-nums text-emerald-600">{formatRp(data.totalInvestasi)}</p>
            </div>
          </div>

          {/* Metric 2 & 3 — berdampingan */}
          <div className="border-t border-border pt-4 grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                + Piutang
              </p>
              <p className="text-lg font-bold tabular-nums">{formatRp(totalKekayaanDenganPiutang)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">Piutang sisa</p>
              <p className={`text-xs font-semibold tabular-nums ${data.piutangSisa > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {formatRp(data.piutangSisa)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                + Piutang (Realistis)
              </p>
              <p className="text-lg font-bold tabular-nums">{formatRp(totalKekayaanRealistis)}</p>
              <p className="text-xs text-muted-foreground mt-1.5">- Piutang Macet</p>
              <p className={`text-xs font-semibold tabular-nums ${data.piutangMacetSisa > 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                {data.piutangMacetSisa > 0 ? formatRp(data.piutangMacetSisa) : "Rp 0"}
              </p>
            </div>
          </div>


          {data.emergencyFundMonths > 0 && (
            <EmergencyGauge months={data.emergencyFundMonths} avgExpense={data.avgMonthlyExpense} />
          )}
        </CardContent>
      </Card>

      <WealthCharts data={data} year={year} />
    </>
  )
}

export function NetWorthSkeleton() {
  return (
    <>
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-3 w-28 bg-muted rounded" />
            <div className="h-9 w-56 bg-muted rounded" />
            <div className="flex gap-6">
              <div className="h-8 w-28 bg-muted rounded" />
              <div className="h-8 w-28 bg-muted rounded" />
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              <div className="h-5 w-full bg-muted rounded" />
              <div className="h-5 w-full bg-muted rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card><CardContent className="p-6 animate-pulse"><div className="h-56 bg-muted rounded" /></CardContent></Card>
          <Card><CardContent className="p-6 animate-pulse"><div className="h-56 bg-muted rounded" /></CardContent></Card>
        </div>
        <Card><CardContent className="p-6 animate-pulse"><div className="h-56 bg-muted rounded" /></CardContent></Card>
      </div>
    </>
  )
}
