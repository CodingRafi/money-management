import { db } from "@/lib/db"
import { requireScope } from "@/lib/scope"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { InvestasiCharts } from "./_components/InvestasiCharts"
import type { CategoryData, LiquidData, HoldingData } from "./_components/InvestasiCharts"
import { GrowthChart } from "./_components/GrowthChart"
import { PerformanceTable } from "./_components/PerformanceTable"
import { monthlyGrowth, realizedPerformance, type CashTx } from "@/lib/investment-metrics"

type CategoryRow = { category_name: string; total_buy: number; total_sell: number }
type LiquidRow   = { is_liquid: number; total_buy: number; total_sell: number }
type TxRow       = { investment_id: string; name: string; category_name: string; is_closed: number; date: string; type: string; total_amount: number }

export default async function InvestasiRekapPage() {
  const scope  = await requireScope()
  const userId = scope.userIds
  const selfId = scope.targetUserId

  const categoryRows = await db.prepare<[string[]], CategoryRow>(
    `SELECT ic.name AS category_name,
            COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_buy,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_sell
     FROM investment_categories ic
     LEFT JOIN investments i   ON i.category_id = ic.id AND i.user_id = ANY(?) AND i.is_active = 1
     LEFT JOIN investment_transactions it ON it.investment_id = i.id
     GROUP BY ic.id, ic.name, ic.sort_order
     ORDER BY ic.sort_order`
  ).all(userId) as CategoryRow[]

  const liquidRows = await db.prepare<[string[]], LiquidRow>(
    `SELECT i.is_liquid,
            COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_buy,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_sell
     FROM investments i
     LEFT JOIN investment_transactions it ON it.investment_id = i.id
     WHERE i.user_id = ANY(?) AND i.is_active = 1
     GROUP BY i.is_liquid`
  ).all(userId) as LiquidRow[]

  const txRows = await db.prepare<[string[]], TxRow>(
    `SELECT i.id AS investment_id, i.name, ic.name AS category_name, i.is_closed,
            it.date, it.type, it.total_amount
     FROM investment_transactions it
     JOIN investments i ON i.id = it.investment_id
     JOIN investment_categories ic ON ic.id = i.category_id
     WHERE i.user_id = ANY(?) AND i.is_active = 1
     ORDER BY it.date`
  ).all(userId) as TxRow[]

  const toTx = (r: TxRow): CashTx => ({ date: r.date, type: r.type, amount: Number(r.total_amount) })
  const growthData = monthlyGrowth(txRows.map(toTx))

  const byAsset = new Map<string, { name: string; category: string; closed: boolean; txs: CashTx[] }>()
  for (const r of txRows) {
    const cur = byAsset.get(r.investment_id) ?? { name: r.name, category: r.category_name, closed: !!r.is_closed, txs: [] }
    cur.txs.push(toTx(r))
    byAsset.set(r.investment_id, cur)
  }

  const holdingData: HoldingData[] = []
  const performanceRows = []
  for (const [id, a] of byAsset) {
    if (a.closed) {
      performanceRows.push({ id, name: a.name, category: a.category, ...realizedPerformance(a.txs) })
    } else {
      const aktif = a.txs.reduce((s, t) => s + (t.type === "BUY" ? t.amount : t.type === "SELL" ? -t.amount : 0), 0)
      if (aktif > 0) holdingData.push({ name: a.name, category: a.category, modalAktif: aktif })
    }
  }
  holdingData.sort((x, y) => y.modalAktif - x.modalAktif)
  performanceRows.sort((x, y) => (y.returnPct ?? -Infinity) - (x.returnPct ?? -Infinity))

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
        holdingData={holdingData}
      />

      <GrowthChart data={growthData} />

      <PerformanceTable rows={performanceRows} />
    </div>
  )
}
