import { Card, CardContent } from "@/components/ui/card"
import { getNetWorth } from "@/lib/dashboard"
import { TrendingDown, TrendingUp } from "lucide-react"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

export async function NetWorthSection({ userId }: { userId: string }) {
  const data = await getNetWorth(userId)

  if (data.total === 0 && data.liquid === 0 && data.nonLiquid === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Tambahkan dompet pertama kamu untuk mulai tracking
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm text-muted-foreground mb-1">Net Worth</p>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <p className="text-3xl font-bold tabular-nums">{formatRp(data.total)}</p>
          {data.changePercent !== null && (
            <span
              className={`flex items-center gap-1 text-sm font-medium ${
                data.changePercent >= 0 ? "text-primary" : "text-destructive"
              }`}
            >
              {data.changePercent >= 0
                ? <TrendingUp className="h-4 w-4" />
                : <TrendingDown className="h-4 w-4" />}
              {Math.abs(data.changePercent).toFixed(1)}% vs bulan lalu
            </span>
          )}
        </div>
        <div className="flex gap-8">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Liquid</p>
            <p className="text-sm font-semibold text-primary tabular-nums">
              {formatRp(data.liquid)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Non-liquid</p>
            <p className="text-sm font-semibold tabular-nums">
              {formatRp(data.nonLiquid)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function NetWorthSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="h-9 w-56 bg-muted rounded" />
          <div className="flex gap-8">
            <div className="h-8 w-28 bg-muted rounded" />
            <div className="h-8 w-28 bg-muted rounded" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
