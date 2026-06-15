"use client"

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, CartesianGrid,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { WealthOverviewData } from "@/lib/dashboard"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)
}

function compact(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}jt`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}rb`
  return `${n}`
}

type TooltipPayloadItem = {
  name: string
  value: number
  color?: string
  fill?: string
  payload?: Record<string, number>
}

function LiquidTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-0.5">{p.name}</p>
      <p className="font-bold">{formatRp(p.value)}</p>
    </div>
  )
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload?.length) return null
  const income  = payload.find(p => p.name === "Pemasukan")?.value  ?? 0
  const expense = payload.find(p => p.name === "Pengeluaran")?.value ?? 0
  const net     = income - expense
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-lg space-y-1 min-w-[160px]">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.fill ?? p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums">{formatRp(p.value)}</span>
        </div>
      ))}
      {income > 0 || expense > 0 ? (
        <div className="border-t pt-1 flex justify-between">
          <span className="text-muted-foreground">Selisih</span>
          <span className={`font-semibold tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {net >= 0 ? "+" : ""}{formatRp(net)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

export function WealthCharts({ data, year }: { data: WealthOverviewData; year: number }) {
  const totalWealth  = data.totalLiquid + data.totalNonLiquid

  const liquidityData = [
    { name: "Liquid",      value: data.totalLiquid,    color: "#10b981" },
    { name: "Non-Liquid",  value: data.totalNonLiquid, color: "#f59e0b" },
  ].filter(d => d.value > 0)

  const hasMonthlyData = data.monthlyGrowth.some(m => m.income > 0 || m.expense > 0)
  const hasYearlyData  = data.yearlyGrowth.length > 0

  const monthlyChartData = data.monthlyGrowth.map(m => ({
    label:       m.label,
    Pemasukan:   m.income,
    Pengeluaran: m.expense,
  }))

  const yearlyChartData = data.yearlyGrowth.map(r => ({
    label:       String(r.year),
    Pemasukan:   r.income,
    Pengeluaran: r.expense,
    net:         r.income - r.expense,
  }))

  return (
    <div className="space-y-4">
      {/* Row 1: Liquidity donut + Monthly bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Liquidity Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Dana Liquid vs Non-Liquid</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {totalWealth > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie
                      data={liquidityData}
                      cx="50%" cy="50%"
                      innerRadius={46} outerRadius={66}
                      dataKey="value" nameKey="name"
                      paddingAngle={2}
                    >
                      {liquidityData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<LiquidTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-2">
                  {[
                    { name: "Liquid",     color: "#10b981", walletAmt: data.liquidDompet,    investAmt: data.liquidInvestasi,    total: data.totalLiquid    },
                    { name: "Non-Liquid", color: "#f59e0b", walletAmt: data.nonLiquidDompet, investAmt: data.nonLiquidInvestasi, total: data.totalNonLiquid },
                  ].filter(d => d.total > 0).map(d => (
                    <div key={d.name}>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="font-medium">{d.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {totalWealth > 0 ? `${((d.total / totalWealth) * 100).toFixed(1)}%` : ""}
                          </span>
                        </div>
                        <span className="font-semibold tabular-nums">{formatRp(d.total)}</span>
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 pl-[18px]">
                        <span>Dompet {compact(d.walletAmt)}</span>
                        {d.investAmt > 0 && <span>· Investasi {compact(d.investAmt)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Belum ada data aset</p>
            )}
          </CardContent>
        </Card>

        {/* Monthly Cashflow Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Cashflow Bulanan {year}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hasMonthlyData ? (
              <>
                <ResponsiveContainer width="100%" height={178}>
                  <BarChart data={monthlyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="Pemasukan"   fill="#10b981" radius={[2,2,0,0]} maxBarSize={12} />
                    <Bar dataKey="Pengeluaran" fill="#ef4444" radius={[2,2,0,0]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Pemasukan</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" />Pengeluaran</span>
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">Belum ada transaksi di {year}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Yearly growth full-width */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Pertumbuhan Kekayaan per Tahun</CardTitle>
          <p className="text-xs text-muted-foreground">Pemasukan vs pengeluaran — selisih = kekayaan baru ditambahkan</p>
        </CardHeader>
        <CardContent className="pt-0">
          {hasYearlyData ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={yearlyChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="Pemasukan"   fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} />
                  <Bar dataKey="Pengeluaran" fill="#f97316" radius={[3,3,0,0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>

              {/* Yearly summary table */}
              <div className="mt-4 space-y-2">
                {yearlyChartData.map(r => (
                  <div key={r.label} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-muted-foreground w-12">{r.label}</span>
                    <span className="text-blue-600 tabular-nums flex-1 text-right">{formatRp(r.Pemasukan)}</span>
                    <span className="text-orange-500 tabular-nums w-36 text-right">{formatRp(r.Pengeluaran)}</span>
                    <span className={`font-semibold tabular-nums w-36 text-right ${r.net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {r.net >= 0 ? "+" : ""}{formatRp(r.net)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-blue-500" />Pemasukan</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-orange-500" />Pengeluaran</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Selisih (tabungan)</span>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data transaksi</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
