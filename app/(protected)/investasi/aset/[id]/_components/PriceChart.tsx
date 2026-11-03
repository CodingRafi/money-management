"use client"

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { rp, short } from "@/lib/risk/format"

export type PriceChartPoint = { date: string; close: number; ma50: number | null; ma200: number | null }

export function PriceChart({ data }: { data: PriceChartPoint[] }) {
  const names: Record<string, string> = { close: "Harga", ma50: "MA 50", ma200: "MA 200" }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={50} tickFormatter={(d: string) => d.slice(2, 7)} />
        <YAxis domain={["auto", "auto"]} tickFormatter={short} tick={{ fontSize: 11 }} width={52} />
        <Tooltip formatter={(v, n) => [rp(Number(v)), names[String(n)] ?? n]} />
        <Line type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ma50" stroke="#f59e0b" strokeWidth={1.5} dot={false} connectNulls />
        <Line type="monotone" dataKey="ma200" stroke="#6366f1" strokeWidth={1.5} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  )
}
