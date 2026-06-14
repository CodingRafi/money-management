import type { ElementType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getRecentTransactions, type RecentTransaction } from "@/lib/dashboard"
import Link from "next/link"
import { ArrowDown, ArrowLeftRight, ArrowUp, BarChart2, ChevronRight } from "lucide-react"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

const TYPE_CONFIG: Record<
  RecentTransaction["type"],
  { icon: ElementType; iconBg: string; iconColor: string }
> = {
  INCOME:     { icon: ArrowDown,       iconBg: "bg-primary/10",          iconColor: "text-primary" },
  EXPENSE:    { icon: ArrowUp,         iconBg: "bg-destructive/10",      iconColor: "text-destructive" },
  TRANSFER:   { icon: ArrowLeftRight,  iconBg: "bg-muted",               iconColor: "text-muted-foreground" },
  INVESTMENT: { icon: BarChart2,       iconBg: "bg-secondary",           iconColor: "text-secondary-foreground" },
}

function amountColor(t: RecentTransaction) {
  if (t.type === "TRANSFER") return "text-foreground"
  return t.isCredit ? "text-primary" : "text-destructive"
}

export async function RecentTransactionsSection({ userId }: { userId: string }) {
  const data = await getRecentTransactions(userId)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Transaksi Terakhir</CardTitle>
          <Link
            href="/rekap"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Lihat semua <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada transaksi — catat transaksi pertama kamu
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.map(t => {
              const cfg = TYPE_CONFIG[t.type]
              return (
                <li key={t.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
                    <cfg.icon className={`h-4 w-4 ${cfg.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.sublabel}</p>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums shrink-0 ${amountColor(t)}`}>
                    {t.isCredit ? "+" : "-"}
                    {formatRp(t.amount)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function RecentTransactionsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-36 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-lg bg-muted shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-32 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
