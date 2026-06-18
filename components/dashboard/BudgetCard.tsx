import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getBudget } from "@/lib/dashboard"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

const STATUS_BAR: Record<string, string> = {
  AMAN:      "bg-primary",
  MENDEKATI: "bg-yellow-500",
  OVER:      "bg-destructive",
}

const STATUS_BADGE: Record<string, string> = {
  AMAN:      "bg-primary/10 text-primary",
  MENDEKATI: "bg-yellow-500/10 text-yellow-600",
  OVER:      "bg-destructive/10 text-destructive",
}

export async function BudgetSection({
  userId,
  month,
  year,
}: {
  userId: string
  month: number
  year: number
}) {
  const data = await getBudget(userId, month, year)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Budget</CardTitle>
          <div className="flex items-center gap-2">
            {data.overBudgetCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {data.overBudgetCount} over budget
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Atur target budget di pengaturan kategori
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.items.map(item => (
              <div key={item.categoryId}>
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="text-xs font-medium truncate">{item.categoryName}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {item.realisasi.toFixed(0)}%<span className="text-muted-foreground/50"> / {item.target}%</span>
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_BAR[item.status]}`}
                    style={{ width: `${Math.min(item.realisasi, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function BudgetSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="animate-pulse space-y-1.5">
              <div className="flex justify-between">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-3 w-16 bg-muted rounded" />
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
