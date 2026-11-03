"use client"

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { monthLabel } from "@/lib/risk/format"

export function DrawdownChart({ data }: { data: { date: string; drawdown: number }[] }) {
  const d = data.map((p) => ({ date: p.date, dd: p.drawdown * 100 }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={d} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gDd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
        <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ fontSize: 11 }} minTickGap={32} />
        <YAxis tickFormatter={(v) => `${Math.round(v)}%`} tick={{ fontSize: 11 }} width={44} />
        <Tooltip labelFormatter={(x) => monthLabel(String(x))} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Drawdown"]} />
        <Area type="monotone" dataKey="dd" stroke="#ef4444" strokeWidth={2} fill="url(#gDd)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
