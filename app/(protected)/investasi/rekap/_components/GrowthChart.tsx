"use client"

import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { GrowthPoint } from "@/lib/investment-metrics"

function formatFull(val: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val)
}

function formatShort(val: number) {
  const abs = Math.abs(val)
  if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}M`
  if (abs >= 1e6) return `${(val / 1e6).toFixed(0)}jt`
  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}rb`
  return String(val)
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "2-digit" })
}

export function GrowthChart({ data }: { data: GrowthPoint[] }) {
  const last = data[data.length - 1]
  const first = data[0]

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold uppercase tracking-wide">Pertumbuhan Portofolio</CardTitle>
        <p className="text-xs text-muted-foreground">
          Modal aktif (BUY − SELL) kumulatif per bulan, beserta dividen yang sudah diterima
        </p>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <div className="flex items-center justify-center py-14 text-sm text-muted-foreground">
            Butuh transaksi minimal 2 bulan untuk menampilkan grafik.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Modal aktif sekarang</p>
                <p className="font-bold tabular-nums text-emerald-600">{formatFull(last.modalAktif)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dividen kumulatif</p>
                <p className="font-bold tabular-nums text-teal-600">{formatFull(last.dividenKumulatif)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-xs text-muted-foreground">Sejak</p>
                <p className="font-bold">{monthLabel(first.label)}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gModal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                <XAxis dataKey="label" tickFormatter={monthLabel} tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} width={48} />
                <Tooltip
                  labelFormatter={(l) => monthLabel(String(l))}
                  formatter={(v, name) => [formatFull(Number(v)), name === "modalAktif" ? "Modal aktif" : "Dividen kumulatif"]}
                />
                <Area type="monotone" dataKey="modalAktif" stroke="#10b981" strokeWidth={2} fill="url(#gModal)" />
                <Area type="monotone" dataKey="dividenKumulatif" stroke="#14b8a6" strokeWidth={2} strokeDasharray="4 3" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}
