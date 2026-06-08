import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getBudget } from "@/lib/dashboard"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

const STATUS_BAR: Record<string, string> = {
  AMAN: "bg-blue-500",
  MENDEKATI: "bg-yellow-500",
  OVER: "bg-red-500",
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
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Budget</CardTitle>
          {data.overBudgetCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {data.overBudgetCount} over budget
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Atur target budget di pengaturan kategori
          </p>
        ) : (
          <ul className="space-y-3">
            {data.items.map(item => (
              <li key={item.categoryId}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs font-medium truncate max-w-[60%]">
                    {item.categoryName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.realisasi.toFixed(0)}%
                    <span className="text-muted-foreground/60"> / {item.target}%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${STATUS_BAR[item.status]}`}
                    style={{ width: `${Math.min(item.realisasi, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <div className="px-6 pb-4 pt-2">
        <Link
          href="/rekap"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Lihat semua <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  )
}

export function BudgetSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="animate-pulse space-y-1.5">
            <div className="flex justify-between">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-3 w-12 bg-muted rounded" />
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
