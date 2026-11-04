"use client"

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import type { MonteCarloResult } from "@/lib/risk/montecarlo"
import { monthLabel, pct, rp, short } from "@/lib/risk/format"

/** Fan chart: band p5–p95 (terang) dan p25–p75 (gelap) + garis median. */
export function FanChart({ result }: { result: MonteCarloResult }) {
  const data = result.percentiles.map((p) => ({
    date: p.date,
    outer: [p.p5, p.p95] as [number, number],
    inner: [p.p25, p.p75] as [number, number],
    median: p.p50,
  }))
  const names: Record<string, string> = { outer: "P5–P95", inner: "P25–P75", median: "Median (P50)" }
  const fmt = (v: unknown) => (Array.isArray(v) ? `${rp(v[0])} – ${rp(v[1])}` : rp(Number(v)))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Median nilai akhir" value={rp(result.finalStats.p50)} />
        <Stat label="Skenario buruk (P5)" value={rp(result.finalStats.p5)} />
        <Stat label="Skenario baik (P95)" value={rp(result.finalStats.p95)} />
        <Stat label="Peluang rugi" value={pct(result.probabilityOfLoss, 0)} hint={`di bawah total setoran ${rp(result.totalContributed)}`} />
        {result.probabilityOfMissingTarget != null && (
          <Stat label="Peluang tak capai target" value={pct(result.probabilityOfMissingTarget, 0)} />
        )}
        <Stat label="Max drawdown (median)" value={pct(result.maxDrawdownDistribution.p50, 0)} hint={`terburuk 5%: ${pct(result.maxDrawdownDistribution.p95, 0)}`} />
        <Stat label="Peluang bangkrut" value={pct(result.ruinProbability, 1)} />
        <Stat label="Metode" value={`${result.method === "BOOTSTRAP" ? "Bootstrap" : "GBM"} · ${result.iterations}×`} hint={`seed ${result.seed}`} />
      </div>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Proyeksi Nilai Portofolio (Monte Carlo)</p>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="date" tickFormatter={monthLabel} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={52} />
              <Tooltip labelFormatter={(d) => monthLabel(String(d))} formatter={(v, n) => [fmt(v), names[String(n)] ?? n]} />
              <Area type="monotone" dataKey="outer" stroke="none" fill="#10b981" fillOpacity={0.15} />
              <Area type="monotone" dataKey="inner" stroke="none" fill="#10b981" fillOpacity={0.3} />
              <Area type="monotone" dataKey="median" stroke="#10b981" strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-3">Sebaran Nilai Akhir</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={result.histogram} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={30} />
              <YAxis tick={{ fontSize: 11 }} width={36} />
              <Tooltip formatter={(v) => [`${v} simulasi`, "Jumlah"]} />
              <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-lg font-bold tabular-nums">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
