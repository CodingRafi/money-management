import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { InvestasiCharts } from "./_components/InvestasiCharts"
import type { CategoryData, LiquidData } from "./_components/InvestasiCharts"

type CategoryRow = { category_name: string; total_buy: number; total_sell: number }
type LiquidRow   = { is_liquid: number; total_buy: number; total_sell: number }

export default async function InvestasiRekapPage() {
  const userId = LOCAL_USER_ID

  const categoryRows = await db.prepare<[string], CategoryRow>(
    `SELECT ic.name AS category_name,
            COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_buy,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_sell
     FROM investment_categories ic
     LEFT JOIN investments i   ON i.category_id = ic.id AND i.user_id = ? AND i.is_active = 1
     LEFT JOIN investment_transactions it ON it.investment_id = i.id
     GROUP BY ic.id, ic.name, ic.sort_order
     ORDER BY ic.sort_order`
  ).all(userId) as CategoryRow[]

  const liquidRows = await db.prepare<[string], LiquidRow>(
    `SELECT i.is_liquid,
            COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_buy,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_sell
     FROM investments i
     LEFT JOIN investment_transactions it ON it.investment_id = i.id
     WHERE i.user_id = ? AND i.is_active = 1
     GROUP BY i.is_liquid`
  ).all(userId) as LiquidRow[]

  const categoryData: CategoryData[] = categoryRows
    .map((r) => ({ name: r.category_name, modalAktif: r.total_buy - r.total_sell }))
    .filter((d) => d.modalAktif > 0)

  const liquidMap: Record<string, number> = { Liquid: 0, "Non-Liquid": 0 }
  for (const r of liquidRows) {
    const key = r.is_liquid ? "Liquid" : "Non-Liquid"
    liquidMap[key] = r.total_buy - r.total_sell
  }
  const liquidData: LiquidData[] = [
    { name: "Liquid",     modalAktif: liquidMap["Liquid"],     color: "#10b981" },
    { name: "Non-Liquid", modalAktif: liquidMap["Non-Liquid"], color: "#f59e0b" },
  ].filter((d) => d.modalAktif > 0)

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <Link href="/investasi"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Rekap Investasi</h1>
          <p className="text-sm text-muted-foreground">Visualisasi komposisi portofolio</p>
        </div>
      </div>

      <InvestasiCharts
        categoryData={categoryData}
        liquidData={liquidData}
      />
    </div>
  )
}
