"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type CategoryData = { name: string; modalAktif: number }
export type LiquidData   = { name: string; modalAktif: number; color: string }
export type HoldingData  = { name: string; category: string; modalAktif: number }

const CATEGORY_COLORS: Record<string, string> = {
  "SAHAM":      "#3b82f6",
  "REKSA DANA": "#8b5cf6",
  "EMAS":       "#f59e0b",
  "KRIPTO":     "#f97316",
  "DEPOSITO":   "#14b8a6",
  "LAINNYA":    "#6b7280",
}
const FALLBACK_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#f97316", "#14b8a6", "#6b7280", "#ec4899", "#84cc16"]

function getCategoryColor(name: string, idx: number) {
  return CATEGORY_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length]
}

function formatFull(val: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(val)
}

function PieTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { pct: number } }>
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md dark:bg-zinc-900">
      <p className="font-semibold mb-1">{payload[0].name}</p>
      <p className="text-emerald-600 font-bold">{formatFull(payload[0].value)}</p>
      <p className="text-muted-foreground">{payload[0].payload.pct.toFixed(1)}%</p>
    </div>
  )
}

function PieLegend({ items }: { items: { name: string; color: string; modalAktif: number; pct: number }[] }) {
  return (
    <div className="mt-4 space-y-1.5">
      {items.map((item) => (
        <div key={item.name} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="truncate text-muted-foreground">{item.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <span className="tabular-nums font-medium">{formatFull(item.modalAktif)}</span>
            <span className="text-xs text-muted-foreground w-10 text-right">{item.pct.toFixed(1)}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-14 text-sm text-muted-foreground">
      {text}
    </div>
  )
}

export function InvestasiCharts({
  categoryData,
  liquidData,
  holdingData,
}: {
  categoryData: CategoryData[]
  liquidData: LiquidData[]
  holdingData: HoldingData[]
}) {
  const totalHold = holdingData.reduce((s, d) => s + d.modalAktif, 0)
  const holdItems = holdingData.map((d) => ({ ...d, pct: totalHold > 0 ? (d.modalAktif / totalHold) * 100 : 0 }))
  const topHolding = holdItems[0]
  const top3Pct = holdItems.slice(0, 3).reduce((s, d) => s + d.pct, 0)

  const totalCat = categoryData.reduce((s, d) => s + d.modalAktif, 0)
  const catItems = categoryData.map((d, i) => ({
    ...d,
    color: getCategoryColor(d.name, i),
    pct: totalCat > 0 ? (d.modalAktif / totalCat) * 100 : 0,
  }))

  const totalLiq = liquidData.reduce((s, d) => s + d.modalAktif, 0)
  const liqItems = liquidData.map((d) => ({
    ...d,
    pct: totalLiq > 0 ? (d.modalAktif / totalLiq) * 100 : 0,
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">Alokasi per Aset</CardTitle>
          <p className="text-xs text-muted-foreground">Porsi tiap aset aktif terhadap total modal aktif</p>
        </CardHeader>
        <CardContent>
          {holdItems.length === 0 ? (
            <EmptyState text="Belum ada aset aktif." />
          ) : (
            <div className="space-y-4">
              {topHolding && topHolding.pct >= 40 && holdItems.length > 1 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Konsentrasi tinggi: <strong>{topHolding.name}</strong> menguasai {topHolding.pct.toFixed(1)}% portofolio.
                  Pertimbangkan diversifikasi.
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                3 aset terbesar = <strong className="text-foreground">{top3Pct.toFixed(1)}%</strong> dari portofolio
              </p>
              <div className="space-y-2.5">
                {holdItems.map((h, i) => (
                  <div key={h.name + i} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium truncate">{h.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{h.category}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="tabular-nums">{formatFull(h.modalAktif)}</span>
                        <span className="text-xs text-muted-foreground w-12 text-right">{h.pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${h.pct}%`, backgroundColor: getCategoryColor(h.category, i) }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Komposisi per Kategori
          </CardTitle>
          <p className="text-xs text-muted-foreground">Berdasarkan modal aktif (BUY − SELL)</p>
        </CardHeader>
        <CardContent>
          {catItems.length === 0 ? (
            <EmptyState text="Belum ada data aset." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={catItems}
                    dataKey="modalAktif"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {catItems.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <PieLegend items={catItems} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Liquid vs Non-Liquid
          </CardTitle>
          <p className="text-xs text-muted-foreground">Proporsi berdasarkan likuiditas aset</p>
        </CardHeader>
        <CardContent>
          {liqItems.length === 0 ? (
            <EmptyState text="Belum ada data aset." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={liqItems}
                    dataKey="modalAktif"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {liqItems.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <PieLegend items={liqItems} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
