"use client"

import { useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const CAT_COLORS = [
  "#4472C4", "#ED7D31", "#A9D18E", "#FF0000", "#FFC000",
  "#5B9BD5", "#70AD47", "#F4B183", "#267330", "#00B0F0",
  "#7030A0", "#FF66B2", "#0070C0", "#595959", "#FFD966",
  "#548235", "#C55A11", "#833C00", "#806000", "#375623",
]

const formatRpLabel = (val: number) => {
  const abs = Math.abs(val)
  if (abs === 0) return "Rp0"
  if (abs >= 1_000_000_000) return `Rp${(abs / 1_000_000_000).toFixed(1)}M`
  if (abs >= 100_000_000) return `Rp${(abs / 1_000_000).toFixed(0)}jt`
  if (abs >= 1_000_000) return `Rp${(abs / 1_000_000).toFixed(1)}jt`
  if (abs >= 1_000) return `Rp${(abs / 1_000).toFixed(0)}rb`
  return `Rp${abs}`
}

const formatRpAxis = (val: number) => {
  const abs = Math.abs(val)
  if (abs >= 1_000_000_000) return `Rp${(abs / 1_000_000_000).toFixed(1)}M`
  if (abs >= 1_000_000) return `Rp${(abs / 1_000_000).toFixed(0)}jt`
  if (abs >= 1_000) return `Rp${(abs / 1_000).toFixed(0)}rb`
  return `Rp${abs}`
}

const formatFull = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val)

function StackedTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; payload: Record<string, number | string> }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const total = (row._total as number) ?? 0

  const entries = payload
    .map((p) => ({
      name: p.name,
      raw: (row[`${p.name}_raw`] as number) ?? 0,
      pct: p.value,
    }))
    .sort((a, b) => b.raw - a.raw)
    .filter((e) => e.raw > 0)

  return (
    <div
      className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md"
      style={{ maxWidth: 260 }}
    >
      <p className="font-semibold mb-1 text-foreground">
        {label} — {formatFull(total)}
      </p>
      <div style={{ maxHeight: 220, overflowY: "auto" }} className="space-y-0.5">
        {entries.map((e) => (
          <div key={e.name} className="flex justify-between gap-2">
            <span
              className="text-muted-foreground"
              style={{
                maxWidth: 110,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {e.name}
            </span>
            <span className="font-medium tabular-nums shrink-0">
              {formatRpLabel(e.raw)} ({e.pct.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function YearlyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-rose-600">{formatFull(payload[0].value ?? 0)}</p>
    </div>
  )
}

interface Props {
  year: number
  categories: string[]
  stackedData: Record<string, number | string>[]
  catTotals: { name: string; total: number }[]
  children: React.ReactNode
}

export function ExpenseDetailTabs({
  year,
  categories,
  stackedData,
  catTotals,
  children,
}: Props) {
  const [activeTab, setActiveTab] = useState<"chart" | "data">("chart")

  const hasData = catTotals.some((c) => c.total > 0)

  return (
    <div>
      <div className="flex gap-0 border-b mb-4">
        {(["chart", "data"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t
                ? "border-rose-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "chart" ? "Chart" : "Data"}
          </button>
        ))}
      </div>

      {activeTab === "chart" && (
        !hasData ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Belum ada data pengeluaran untuk tahun ini.
          </p>
        ) : (
          <div className="space-y-5">
            {/* 100% Stacked bar per month */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-center">
                  Rekap Pengeluaran Per Kategori {year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={stackedData}
                    margin={{ top: 10, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5e7eb"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10, fill: "#555" }}
                      axisLine={{ stroke: "#9ca3af" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 10, fill: "#555" }}
                      axisLine={false}
                      tickLine={false}
                      domain={[0, 100]}
                    />
                    <Tooltip content={<StackedTooltip />} cursor={{ fill: "#f3f4f6" }} />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      wrapperStyle={{ fontSize: 9, paddingLeft: 8 }}
                      iconSize={8}
                      iconType="square"
                    />
                    {categories.map((cat, i) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="a"
                        fill={CAT_COLORS[i % CAT_COLORS.length]}
                        maxBarSize={60}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Yearly totals per category */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-center">
                  Rekap Pengeluaran Tahun {year}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={catTotals}
                    margin={{ top: 30, right: 20, left: 20, bottom: 70 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e5e7eb"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 9, fill: "#555" }}
                      axisLine={{ stroke: "#9ca3af" }}
                      tickLine={false}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={formatRpAxis}
                      tick={{ fontSize: 10, fill: "#555" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<YearlyTooltip />} cursor={{ fill: "#f3f4f6" }} />
                    <Bar
                      dataKey="total"
                      fill="#4472C4"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={80}
                    >
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(v: unknown) => formatRpLabel(Number(v))}
                        style={{ fontSize: 9, fill: "#4472C4", fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )
      )}

      {activeTab === "data" && children}
    </div>
  )
}
