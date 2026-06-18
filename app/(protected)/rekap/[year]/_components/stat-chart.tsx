"use client"

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type StatRow = { label: string; value: number }
type WealthRow = { label: string; nominal: number; pct: number }

const formatRp = (val: number) => {
  const abs = Math.abs(val)
  const sign = val < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}jt`
  if (abs >= 1_000) return `${sign}Rp${(abs / 1_000).toFixed(0)}rb`
  return `${sign}Rp${abs}`
}

const formatFull = (val: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val)

function GrowthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className={val >= 0 ? "text-emerald-600" : "text-red-600"}>
        {val >= 0 ? "+" : ""}
        {formatFull(val)}
      </p>
    </div>
  )
}

function RatioTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className={val > 100 ? "text-red-600" : val > 80 ? "text-amber-600" : "text-emerald-600"}>
        {val.toFixed(1)}%
      </p>
    </div>
  )
}

function SavingRateTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const val = payload[0].value
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className={val >= 0 ? "text-emerald-600" : "text-red-600"}>
        {val >= 0 ? "+" : ""}
        {val.toFixed(1)}% saving rate
      </p>
    </div>
  )
}

function WealthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { value: number; payload: WealthRow }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const nominal = payload[0].value
  const pct = payload[0].payload.pct
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <p className={nominal >= 0 ? "text-emerald-600" : "text-red-600"}>
        {nominal >= 0 ? "+" : ""}
        {formatFull(nominal)}
      </p>
      <p className="text-muted-foreground mt-0.5">
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}% dari pendapatan
      </p>
    </div>
  )
}

type Props =
  | { type: "income_growth"; data: StatRow[] }
  | { type: "expense_ratio"; data: StatRow[] }
  | { type: "wealth_growth"; data: WealthRow[] }
  | { type: "saving_rate";   data: StatRow[] }

export function StatChart(props: Props) {
  if (props.data.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Belum ada data yang cukup untuk ditampilkan.
      </p>
    )
  }

  if (props.type === "income_growth") {
    const data = props.data
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Kenaikan Pendapatan per Bulan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#555" }}
                axisLine={{ stroke: "#9ca3af" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatRp}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<GrowthTooltip />} cursor={{ fill: "#f3f4f6" }} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1.5} />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={80}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.value >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    )
  }

  if (props.type === "expense_ratio") {
    const data = props.data
    const maxVal = Math.max(...data.map((d) => d.value), 110)
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Pengeluaran vs Pendapatan per Bulan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#555" }}
                axisLine={{ stroke: "#9ca3af" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
                domain={[0, Math.ceil(maxVal / 10) * 10]}
              />
              <Tooltip content={<RatioTooltip />} cursor={{ fill: "#f3f4f6" }} />
              <ReferenceLine
                y={100}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: "100%", position: "right", fontSize: 10, fill: "#ef4444" }}
              />
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={80}>
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.value > 100 ? "#ef4444" : entry.value > 80 ? "#f59e0b" : "#4472C4"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    )
  }

  if (props.type === "wealth_growth") {
    const data = props.data
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Kenaikan Kekayaan per Bulan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#555" }}
                axisLine={{ stroke: "#9ca3af" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatRp}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<WealthTooltip />} cursor={{ fill: "#f3f4f6" }} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1.5} />
              <Bar dataKey="nominal" radius={[3, 3, 0, 0]} maxBarSize={80}>
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.nominal >= 0 ? "#10b981" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    )
  }

  if (props.type === "saving_rate") {
    const data = props.data
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-wide">
            Saving Rate per Bulan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#555" }}
                axisLine={{ stroke: "#9ca3af" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: "#555" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<SavingRateTooltip />} cursor={{ stroke: "#9ca3af", strokeWidth: 1 }} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1.5} />
              <Line
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 4, fill: "#3b82f6", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    )
  }

  return null
}
