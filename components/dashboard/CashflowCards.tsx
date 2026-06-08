import { Card, CardContent } from "@/components/ui/card"
import { getCashflow } from "@/lib/dashboard"
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react"

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

  if (data.totalIncome === 0 && data.totalExpense === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Belum ada transaksi bulan ini</p>
        </CardContent>
      </Card>
    )
  }

  const cards = [
    {
      label: "Pendapatan",
      value: data.totalIncome,
      sublabel: `${data.incomeCount} transaksi`,
      icon: ArrowDownLeft,
      iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-600",
    },
    {
      label: "Pengeluaran",
      value: data.totalExpense,
      sublabel: `${data.expenseRatio.toFixed(0)}% dari pendapatan`,
      icon: ArrowUpRight,
      iconBg: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-500",
      valueColor: "text-red-500",
    },
    {
      label: "Sisa",
      value: data.remaining,
      sublabel: `Saving rate ${data.savingRatio.toFixed(0)}%`,
      icon: Wallet,
      iconBg: "bg-muted",
      iconColor: "text-muted-foreground",
      valueColor: data.remaining >= 0 ? "text-foreground" : "text-red-500",
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map(c => (
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
  )
}

export function CashflowSkeleton() {
  return (
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
  )
}
