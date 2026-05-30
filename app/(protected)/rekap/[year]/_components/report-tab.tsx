"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type ChartRow = { label: string; total: number }

const formatRp = (val: number) => {
  if (val === 0) return "Rp0"
  if (val >= 1_000_000) return `Rp${(val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 1)}jt`
  if (val >= 1_000) return `Rp${(val / 1_000).toFixed(0)}rb`
  return `Rp${val}`
}

const formatFull = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val)

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className="text-blue-600">{formatFull(payload[0].value ?? 0)}</p>
    </div>
  )
}

interface Props {
  needsData: ChartRow[]
  categoryData: ChartRow[]
}

export function ReportTab({ needsData, categoryData }: Props) {
  const noData = needsData.length === 0 && categoryData.length === 0

  if (noData) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Belum ada data pengeluaran bulan ini.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {/* Chart 1 — Kebutuhan */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Kebutuhan Pengeluaran
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={needsData}
              margin={{ top: 10, right: 20, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "#555" }}
                axisLine={{ stroke: "#9ca3af" }}
                tickLine={false}
                label={{ value: "KEBUTUHAN", position: "insideBottom", offset: -10, fontSize: 10, fill: "#888" }}
              />
              <YAxis
                tickFormatter={formatRp}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "TOTAL", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "#888" }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f3f4f6" }} />
              <Bar dataKey="total" fill="#4472C4" radius={[3, 3, 0, 0]} maxBarSize={100} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Chart 2 — Kategori */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Kategori Pengeluaran
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={categoryData}
              margin={{ top: 10, right: 20, left: 20, bottom: 55 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={{ stroke: "#9ca3af" }}
                tickLine={false}
                angle={-30}
                textAnchor="end"
                interval={0}
                label={{ value: "KATEGORI", position: "insideBottom", offset: -45, fontSize: 10, fill: "#888" }}
              />
              <YAxis
                tickFormatter={formatRp}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "TOTAL", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "#888" }}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f3f4f6" }} />
              <Bar dataKey="total" fill="#4472C4" radius={[3, 3, 0, 0]} maxBarSize={80} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
