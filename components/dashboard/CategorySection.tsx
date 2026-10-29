import { getCategoryBreakdown } from "@/lib/dashboard"
import { CategoryPieCharts } from "./CategoryPieCharts"
import { Card, CardContent } from "@/components/ui/card"

export async function CategorySection({
  userId,
  month,
  year,
}: {
  userId: string
  month: number
  year: number
}) {
  const data = await getCategoryBreakdown(userId, month, year)
  if (data.expenses.length === 0 && data.incomes.length === 0) return null
  return <CategoryPieCharts data={data} />
}

export function CategorySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1].map(i => (
        <Card key={i}>
          <CardContent className="p-4 animate-pulse space-y-3">
            <div className="h-3 w-32 bg-muted rounded" />
            <div className="h-36 w-full bg-muted rounded" />
            <div className="space-y-2">
              {[0,1,2].map(j => <div key={j} className="h-3 w-full bg-muted rounded" />)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
