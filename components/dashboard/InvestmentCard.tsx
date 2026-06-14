import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getInvestment, type GoalItem } from "@/lib/dashboard"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

const GOAL_STATUS_LABEL: Record<GoalItem["status"], string> = {
  ON_TRACK: "On Track",
  BEHIND: "Behind",
  COMPLETED: "Selesai",
  NO_TARGET: "",
}

const GOAL_STATUS_COLOR: Record<GoalItem["status"], string> = {
  ON_TRACK: "bg-primary",
  BEHIND: "bg-yellow-500",
  COMPLETED: "bg-primary/60",
  NO_TARGET: "bg-muted",
}

export async function InvestmentSection({ userId }: { userId: string }) {
  const data = await getInvestment(userId)

  const hasPL = data.netProfitLoss !== 0

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Kantong Investasi</CardTitle>
          {hasPL && (
            <Badge
              variant={data.netProfitLoss >= 0 ? "default" : "destructive"}
              className={`text-xs ${data.netProfitLoss >= 0 ? "bg-primary hover:bg-primary" : ""}`}
            >
              {data.netProfitLoss >= 0 ? "+" : ""}
              {formatRp(data.netProfitLoss)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {data.goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Mulai buat kantong investasi pertama kamu
          </p>
        ) : (
          <ul className="space-y-3">
            {data.goals.map(g => (
              <li key={g.id}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium truncate max-w-[60%]">{g.name}</span>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatRp(g.totalModal)}
                    </span>
                    {g.status !== "NO_TARGET" && (
                      <span className="text-xs text-muted-foreground/60">
                        {GOAL_STATUS_LABEL[g.status]}
                      </span>
                    )}
                  </div>
                </div>
                {g.progress !== null && g.targetAmount !== null && (
                  <>
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${GOAL_STATUS_COLOR[g.status]}`}
                        style={{ width: `${g.progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {g.progress.toFixed(0)}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Target {formatRp(g.targetAmount)}
                      </span>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <div className="px-6 pb-4 pt-2">
        <Link
          href="/investasi"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Lihat semua <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  )
}

export function InvestmentSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="animate-pulse space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
