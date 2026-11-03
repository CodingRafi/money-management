"use client"

import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { monthLabel, rp, short } from "@/lib/risk/format"

type Point = { date: string; portfolio: number; benchmark: number | null; contributions: number }

export function SimulationChart({ series, benchmarkLabel }: { series: Point[]; benchmarkLabel?: string | null }) {
  const hasBench = series.some((p) => p.benchmark != null)
  const names: Record<string, string> = {
    portfolio: "Portofolio",
    benchmark: benchmarkLabel ?? "Benchmark",
    contributions: "Total setoran",
  }
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold mb-1">Nilai Portofolio vs Benchmark</p>
        <p className="text-xs text-muted-foreground mb-3">Backtest historis dengan setoran bulanan yang sama untuk keduanya</p>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gSim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
            <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ fontSize: 11 }} minTickGap={32} />
            <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={52} />
            <Tooltip labelFormatter={(d) => monthLabel(String(d))} formatter={(v, n) => [rp(Number(v)), names[String(n)] ?? n]} />
            <Legend formatter={(n) => names[String(n)] ?? n} />
            <Area type="monotone" dataKey="portfolio" stroke="#10b981" strokeWidth={2} fill="url(#gSim)" />
            {hasBench && <Line type="monotone" dataKey="benchmark" stroke="#f59e0b" strokeWidth={2} dot={false} />}
            <Line type="monotone" dataKey="contributions" stroke="#94a3b8" strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
