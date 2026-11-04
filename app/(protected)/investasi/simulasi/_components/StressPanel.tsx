"use client"

import { useEffect, useState, useTransition } from "react"
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { runStressTest, type StressOutput } from "@/app/actions/simulation"
import { pct, rp } from "@/lib/risk/format"

const SCORE_CLASS = ["", "bg-emerald-500", "bg-lime-500", "bg-yellow-400", "bg-orange-500", "bg-red-600"]

export function StressPanel() {
  const [data, setData] = useState<StressOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [pending, start] = useTransition()

  function run(shocks: Record<string, number>) {
    start(async () => {
      const r = await runStressTest(shocks)
      if (r.ok) { setData(r.data); setError(null) } else setError(r.error)
    })
  }
  useEffect(() => { run({}) }, [])

  function runCustom() {
    const shocks: Record<string, number> = {}
    for (const [id, v] of Object.entries(custom)) {
      const n = parseFloat(v)
      if (Number.isFinite(n)) shocks[id] = n / 100
    }
    run(shocks)
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {data && data.positions.length === 0 && (
        <p className="text-sm text-muted-foreground">Belum ada posisi aktif untuk di-stress test.</p>
      )}
      {data && data.positions.length > 0 && (
        <>
          <Card>
            <CardContent className="p-4 overflow-x-auto">
              <p className="text-sm font-semibold mb-1">Dampak Skenario ke Portofolio Saat Ini</p>
              <p className="text-xs text-muted-foreground mb-3">Nilai sekarang: {rp(data.results[0]?.baseValue ?? 0)}. Guncangan diasumsikan instan.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3 font-medium">Skenario</th>
                    <th className="py-2 pr-3 font-medium text-right">Nilai setelah</th>
                    <th className="py-2 pr-3 font-medium text-right">Δ</th>
                    <th className="py-2 pr-3 font-medium text-right">Pulih (bln)</th>
                    <th className="py-2 font-medium text-center">Dampak</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.code} className="border-b last:border-0" title={r.description}>
                      <td className="py-2 pr-3">{r.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{rp(r.stressedValue)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${r.changePct < 0 ? "text-red-500" : "text-emerald-600"}`}>{pct(r.changePct)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.recoveryMonths ?? "—"}</td>
                      <td className="py-2 text-center">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold text-white ${SCORE_CLASS[r.impactScore]}`}>{r.impactScore}/5</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">Perbandingan Perubahan Nilai</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.results.map((r) => ({ name: r.code, value: r.changePct * 100 }))} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={44} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Perubahan"]} />
                  <Bar dataKey="value">
                    {data.results.map((r) => <Cell key={r.code} fill={r.changePct < 0 ? "#ef4444" : "#10b981"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Skenario Kustom</p>
              <p className="text-xs text-muted-foreground">Isi guncangan per aset dalam persen (mis. -30). Kosong = pakai asumsi kelas aset.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.positions.map((p) => (
                  <div key={p.investmentId} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate" title={p.name}>{p.name}</span>
                    <Input
                      type="number" step="1" min="-100" max="1000" placeholder="%"
                      className="h-8 w-24"
                      value={custom[p.investmentId] ?? ""}
                      onChange={(e) => setCustom((c) => ({ ...c, [p.investmentId]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={runCustom} disabled={pending}>{pending ? "Menghitung…" : "Jalankan skenario kustom"}</Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
