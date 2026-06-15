import { Card, CardContent } from "@/components/ui/card"
import { getWealthOverview } from "@/lib/dashboard"
import { Shield } from "lucide-react"
import { WealthCharts } from "./WealthCharts"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

export async function NetWorthSection({ userId, year }: { userId: string; year: number }) {
  const data = getWealthOverview(userId, year)

  const emergencyStatus =
    data.emergencyFundMonths >= 6 ? "AMAN"  :
    data.emergencyFundMonths >= 3 ? "CUKUP" : "KURANG"

  const emergencyColor =
    emergencyStatus === "AMAN"  ? "text-emerald-600" :
    emergencyStatus === "CUKUP" ? "text-amber-500"   : "text-red-500"

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

          {/* Hutang */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Hutang</p>
                <p className={`text-sm font-semibold tabular-nums ${data.hutangSisa > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {data.hutangSisa > 0 ? formatRp(data.hutangSisa) : "Tidak ada hutang"}
                </p>
              </div>
              {data.hutangSisa > 0 && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground mb-0.5">Kekayaan Bersih</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatRp(data.totalKekayaan - data.hutangSisa)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Dana darurat indicator */}
          {data.emergencyFundMonths > 0 && (
            <div className="border-t border-border mt-4 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">Dana Darurat (liquid)</span>
              </div>
              <span className={`text-xs font-semibold ${emergencyColor}`}>
                {data.emergencyFundMonths.toFixed(1)} bulan · {emergencyStatus}
              </span>
            </div>
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
