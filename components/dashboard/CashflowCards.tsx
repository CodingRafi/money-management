import { Card, CardContent } from "@/components/ui/card"
import { getCashflow } from "@/lib/dashboard"
import { ArrowDownLeft, ArrowUpRight, Wallet, TrendingUp, Sigma } from "lucide-react"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

export async function CashflowSection({
  userId,
  month,
  year,
}: {
  userId: string
  month: number
  year: number
}) {
  const data = await getCashflow(userId, month, year)

  const hasAnyData = data.totalIncome > 0 || data.totalExpense > 0 || data.investGain !== 0
  if (!hasAnyData) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Belum ada transaksi bulan ini</p>
        </CardContent>
      </Card>
    )
  }

  const row1 = [
    {
      label:      "Pendapatan",
      value:      data.totalIncome,
      sublabel:   `${data.incomeCount} transaksi`,
      icon:       ArrowDownLeft,
      iconBg:     "bg-primary/10",
      iconColor:  "text-primary",
      valueColor: "text-primary",
    },
    {
      label:      "Hasil Investasi",
      value:      data.investGain,
      sublabel:   "Capital gain + Dividen",
      icon:       TrendingUp,
      iconBg:     data.investGain >= 0 ? "bg-teal-500/10" : "bg-orange-500/10",
      iconColor:  data.investGain >= 0 ? "text-teal-600"  : "text-orange-500",
      valueColor: data.investGain >= 0 ? "text-teal-600"  : "text-orange-500",
    },
    {
      label:      "Total Efektif",
      value:      data.totalEfektif,
      sublabel:   "Pendapatan + Investasi",
      icon:       Sigma,
      iconBg:     "bg-violet-500/10",
      iconColor:  "text-violet-600",
      valueColor: "text-violet-600",
    },
  ]

  const row2 = [
    {
      label:      "Pengeluaran",
      value:      data.totalExpense,
      sublabel:   `${data.expenseRatio.toFixed(0)}% dari total efektif`,
      icon:       ArrowUpRight,
      iconBg:     "bg-destructive/10",
      iconColor:  "text-destructive",
      valueColor: "text-destructive",
    },
    {
      label:      "Sisa",
      value:      data.remaining,
      sublabel:   `Saving rate ${data.savingRatio.toFixed(0)}%`,
      icon:       Wallet,
      iconBg:     "bg-muted",
      iconColor:  "text-muted-foreground",
      valueColor: data.remaining >= 0 ? "text-foreground" : "text-destructive",
    },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {row1.map(c => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.iconBg}`}>
                  <c.icon className={`h-4 w-4 ${c.iconColor}`} />
                </div>
              </div>
              <p className={`text-base font-bold tabular-nums ${c.valueColor}`}>
                {formatRp(c.value)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sublabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {row2.map(c => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.iconBg}`}>
                  <c.icon className={`h-4 w-4 ${c.iconColor}`} />
                </div>
              </div>
              <p className={`text-base font-bold tabular-nums ${c.valueColor}`}>
                {formatRp(c.value)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.sublabel}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export function CashflowSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-5 w-28 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-5 w-28 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
