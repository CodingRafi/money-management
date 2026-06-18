"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CategoryBreakdownData } from "@/lib/dashboard"

const EXPENSE_COLORS = ["#ef4444","#f97316","#f59e0b","#84cc16","#14b8a6","#3b82f6","#8b5cf6","#ec4899","#6b7280"]
const INCOME_COLORS  = ["#10b981","#06b6d4","#3b82f6","#8b5cf6","#f59e0b","#f97316","#6b7280"]

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-0.5">{payload[0].name}</p>
      <p className="font-bold">{formatRp(payload[0].value)}</p>
    </div>
  )
}

function DonutChart({ items, colors }: { items: { name: string; total: number }[]; colors: string[] }) {
  const total = items.reduce((s, i) => s + i.total, 0)
  return (
    <>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={items} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={2}>
            {items.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke="none" />)}
          </Pie>
          <Tooltip content={<PieTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-2 space-y-1.5">
        {items.slice(0, 6).map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-xs gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
              <span className="truncate text-muted-foreground">{item.name}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="tabular-nums font-medium">{formatRp(item.total)}</span>
              <span className="text-muted-foreground/60 w-8 text-right">{total > 0 ? `${((item.total / total) * 100).toFixed(0)}%` : ""}</span>
            </div>
          </div>
        ))}
        {items.length > 6 && (
          <p className="text-[10px] text-muted-foreground text-right">+{items.length - 6} lainnya</p>
        )}
      </div>
    </>
  )
}

export function CategoryPieCharts({ data }: { data: CategoryBreakdownData }) {
  const hasExpense = data.expenses.length > 0
  const hasIncome  = data.incomes.length > 0
  if (!hasExpense && !hasIncome) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Komposisi Pengeluaran</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {hasExpense ? (
            <DonutChart items={data.expenses} colors={EXPENSE_COLORS} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pengeluaran bulan ini</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Komposisi Pendapatan</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {hasIncome ? (
            <DonutChart items={data.incomes} colors={INCOME_COLORS} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Belum ada pendapatan bulan ini</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
