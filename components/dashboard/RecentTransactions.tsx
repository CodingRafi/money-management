import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { getRecentCashflowTx, getRecentInvestmentTx, getRecentLoanTx } from "@/lib/dashboard"
import { RecentTransactionsClient } from "./RecentTransactionsClient"

export function RecentTransactionsSection({ userId }: { userId: string }) {
  const cashflow   = getRecentCashflowTx(userId, 30)
  const investment = getRecentInvestmentTx(userId, 30)
  const loan       = getRecentLoanTx(userId, 30)

  return (
    <RecentTransactionsClient
      initialCashflow={cashflow}
      initialInvestment={investment}
      initialLoan={loan}
    />
  )
}

export function RecentTransactionsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {[0, 1, 2].map(i => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-36 bg-muted rounded animate-pulse" />
              <div className="h-6 w-20 bg-muted rounded animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {[0, 1, 2, 3, 4].map(j => (
              <div key={j} className="flex items-center gap-2.5 animate-pulse">
                <div className="h-7 w-7 rounded-lg bg-muted shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 w-28 bg-muted rounded" />
                  <div className="h-2.5 w-20 bg-muted rounded" />
                </div>
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
