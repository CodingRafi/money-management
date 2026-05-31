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
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type CatTotal = { name: string; total: number }

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

function BarTooltip({
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
      <p className="text-emerald-600">{formatFull(payload[0].value ?? 0)}</p>
    </div>
  )
}

interface Props {
  year: number
  chartData: CatTotal[]
  children: React.ReactNode
}

export function IncomeDetailTabs({ year, chartData, children }: Props) {
  const [activeTab, setActiveTab] = useState<"chart" | "data">("chart")

  return (
    <div>
      <div className="flex gap-0 border-b mb-4">
        {(["chart", "data"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t
                ? "border-emerald-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "chart" ? "Chart" : "Data"}
          </button>
        ))}
      </div>

      {activeTab === "chart" && (
        chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Belum ada data pendapatan untuk tahun ini.
          </p>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-center">
                Rekap Pendapatan {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={chartData}
                  margin={{ top: 30, right: 20, left: 20, bottom: 50 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5e7eb"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#555" }}
                    axisLine={{ stroke: "#9ca3af" }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={formatRpAxis}
                    tick={{ fontSize: 10, fill: "#555" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "#f3f4f6" }} />
                  <Bar
                    dataKey="total"
                    fill="#4472C4"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={120}
                  >
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(v: unknown) => formatRpLabel(Number(v))}
                      style={{ fontSize: 10, fill: "#4472C4", fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )
      )}

      {activeTab === "data" && children}
    </div>
  )
}
