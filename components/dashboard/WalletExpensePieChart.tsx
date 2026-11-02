"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Wallet } from "lucide-react"

export type WalletExpenseItem = {
  id: string
  name: string
  categoryName: string | null
  color: string | null
  total: number
}

const PALETTE = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6b7280",
]

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

function WalletTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-0.5">{payload[0].name}</p>
      <p className="font-bold tabular-nums">{formatRp(payload[0].value)}</p>
    </div>
  )
}

/**
 * Pie chart pengeluaran per dompet — "dari wallet mana uang keluar".
 * Warna slice mengikuti warna dompet bila diisi, memakai palet cadangan bila tidak.
 */
export function WalletExpensePieChart({
  items,
  title = "Pengeluaran per Dompet",
  subtitle,
  className,
}: {
  items: WalletExpenseItem[]
  title?: string
  subtitle?: string
  className?: string
}) {
  const active = items.filter((i) => i.total > 0)
  if (active.length === 0) return null

  const total = active.reduce((s, i) => s + i.total, 0)
  const colorOf = (i: WalletExpenseItem, idx: number) => i.color ?? PALETTE[idx % PALETTE.length]

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              {title}
            </CardTitle>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">Total</p>
            <p className="text-sm font-bold tabular-nums text-destructive">{formatRp(total)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-1/2 min-w-[180px]">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={active}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={78}
                  paddingAngle={2}
                >
                  {active.map((item, i) => (
                    <Cell key={item.id} fill={colorOf(item, i)} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<WalletTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full sm:w-1/2 space-y-1.5">
            {active.map((item, i) => (
              <div key={item.id} className="flex items-center justify-between text-xs gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: colorOf(item, i) }}
                  />
                  <span className="truncate text-muted-foreground" title={item.name}>
                    {item.name}
                  </span>
                  {item.categoryName && (
                    <span className="hidden shrink-0 text-[10px] text-muted-foreground/60 sm:inline">
                      {item.categoryName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="tabular-nums font-medium">{formatRp(item.total)}</span>
                  <span className="text-muted-foreground/60 w-9 text-right tabular-nums">
                    {total > 0 ? `${((item.total / total) * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
