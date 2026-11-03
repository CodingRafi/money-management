"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { runSimulation, type SimulationOutput } from "@/app/actions/simulation"
import { benchmarkLabel } from "@/lib/risk/benchmark"
import { pct } from "@/lib/risk/format"
import { MetricsCards } from "./MetricsCards"
import { SimulationChart } from "./SimulationChart"
import { AssetBreakdown } from "./AssetBreakdown"
import { FanChart } from "./FanChart"
import { StressPanel } from "./StressPanel"
import { PRESETS, toQuery, type SimAssetOption, type UrlState, type WeightMap } from "./presets"

type Tab = "backtest" | "montecarlo" | "stress"

const REBALANCE_OPTIONS = [
  { v: "NONE", l: "Tanpa rebalance" },
  { v: "MONTHLY", l: "Bulanan" },
  { v: "QUARTERLY", l: "Per kuartal" },
  { v: "ANNUAL", l: "Tahunan" },
] as const

export function Simulator({
  assets, benchmarks, currentWeights, initial, withoutPrices,
}: {
  assets: SimAssetOption[]
  benchmarks: string[]
  currentWeights: WeightMap
  initial: UrlState
  withoutPrices: { id: string; name: string }[]
}) {
  const valid = new Set(assets.map((a) => a.id))
  const initAlloc = useMemo(() => {
    const fromUrl = Object.fromEntries(Object.entries(initial.alloc ?? {}).filter(([id]) => valid.has(id)))
    return Object.keys(fromUrl).length ? fromUrl : PRESETS[0].build(assets, currentWeights)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [capital, setCapital] = useState(initial.cap ?? 100_000_000)
  const [contrib, setContrib] = useState(initial.contrib ?? 2_000_000)
  const [years, setYears] = useState(Math.min(40, Math.max(1, Math.round(initial.years ?? 5))))
  const [alloc, setAlloc] = useState<WeightMap>(initAlloc)
  const [bench, setBench] = useState(initial.bench && benchmarks.includes(initial.bench) ? initial.bench : benchmarks[0] ?? "")
  const [reb, setReb] = useState<string>(initial.reb ?? "ANNUAL")
  const [cost, setCost] = useState(0.15)
  const [tab, setTab] = useState<Tab>("backtest")
  const [mcMethod, setMcMethod] = useState<"BOOTSTRAP" | "GBM">("BOOTSTRAP")
  const [iterations, setIterations] = useState(1000)
  const [seed, setSeed] = useState(42)
  const [target, setTarget] = useState(0)

  const [out, setOut] = useState<SimulationOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const seq = useRef(0)

  const total = Object.values(alloc).reduce((s, w) => s + (w || 0), 0)
  const totalOk = Math.abs(total - 100) < 0.5
  const wantMc = tab === "montecarlo"

  // Jalankan ulang (debounce) saat input berubah dan total bobot = 100%.
  useEffect(() => {
    if (tab === "stress" || !totalOk || assets.length === 0) return
    const id = ++seq.current
    const t = setTimeout(() => {
      const allocation = Object.entries(alloc).filter(([, w]) => w > 0).map(([investmentId, w]) => ({ investmentId, weight: w / total }))
      start(async () => {
        const r = await runSimulation({
          initialCapital: capital || 0,
          monthlyContribution: contrib || 0,
          years,
          allocation,
          benchmarkCode: bench || null,
          rebalance: reb,
          transactionCost: cost / 100,
          monteCarlo: wantMc ? { method: mcMethod, iterations, seed, targetAmount: target > 0 ? target : null } : undefined,
        })
        if (id !== seq.current) return
        if (r.ok) { setOut(r.data); setError(null) } else setError(r.error)
      })
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capital, contrib, years, alloc, bench, reb, cost, tab, mcMethod, iterations, seed, target])

  // State di URL supaya bisa di-bookmark / dibagikan.
  useEffect(() => {
    const q = toQuery({ cap: capital || 0, contrib: contrib || 0, years, alloc, bench, reb })
    window.history.replaceState(null, "", `?${q}`)
  }, [capital, contrib, years, alloc, bench, reb])

  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 space-y-2 text-sm">
          <p className="font-semibold">Belum ada data harga historis</p>
          <p className="text-muted-foreground">
            Simulasi membutuhkan minimal 3 bulan harga per aset. Buka halaman aset lalu isi ticker &amp; sync, tempel harga (CSV),
            atau input manual. Untuk demo: <code>bun scripts/seed-prices.ts</code>.
          </p>
          {tab !== "stress" && <Button size="sm" variant="outline" onClick={() => setTab("stress")}>Lihat stress test portofolio saat ini</Button>}
        </CardContent>
      </Card>
    )
  }

  const sim = out?.simulation
  const noSeries = !!sim && sim.series.length === 0

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
      {/* Kontrol */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <Field label="Modal awal (Rp)"><Input type="number" min="0" value={capital} onChange={(e) => setCapital(parseFloat(e.target.value))} className="h-9" /></Field>
            <Field label="Kontribusi bulanan (Rp)"><Input type="number" min="0" value={contrib} onChange={(e) => setContrib(parseFloat(e.target.value))} className="h-9" /></Field>
            <Field label={`Horizon: ${years} tahun`}>
              <input type="range" min={1} max={40} value={years} onChange={(e) => setYears(parseInt(e.target.value))} className="w-full" />
            </Field>
            <Field label="Rebalance">
              <select value={reb} onChange={(e) => setReb(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {REBALANCE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Field>
            <Field label="Benchmark">
              <select value={bench} onChange={(e) => setBench(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">Tanpa benchmark</option>
                {benchmarks.map((b) => <option key={b} value={b}>{benchmarkLabel(b)}</option>)}
              </select>
            </Field>
            <Field label="Biaya transaksi per sisi (%)"><Input type="number" min="0" max="5" step="0.05" value={cost} onChange={(e) => setCost(parseFloat(e.target.value) || 0)} className="h-9" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Alokasi</p>
              <span className={`text-xs font-semibold ${totalOk ? "text-emerald-600" : "text-red-500"}`}>Total {total.toFixed(1)}%</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button key={p.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAlloc(p.build(assets, currentWeights))}>{p.label}</Button>
              ))}
            </div>
            <div className="space-y-2.5">
              {assets.map((a) => (
                <div key={a.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs flex-1 truncate" title={`${a.name} · ${a.months} bln data`}>{a.name}</span>
                    <Input type="number" min="0" max="100" step="1" className="h-7 w-16 text-right text-xs px-1.5"
                      value={alloc[a.id] ?? 0}
                      onChange={(e) => setAlloc((s) => ({ ...s, [a.id]: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) }))} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <input type="range" min={0} max={100} step={1} value={alloc[a.id] ?? 0} className="w-full h-1"
                    onChange={(e) => setAlloc((s) => ({ ...s, [a.id]: parseInt(e.target.value) }))} />
                </div>
              ))}
            </div>
            {withoutPrices.length > 0 && (
              <p className="text-[11px] text-muted-foreground">Tanpa data harga (tidak bisa dipilih): {withoutPrices.map((w) => w.name).join(", ")}</p>
            )}
          </CardContent>
        </Card>

        {wantMc && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Monte Carlo</p>
              <Field label="Metode">
                <select value={mcMethod} onChange={(e) => setMcMethod(e.target.value as "BOOTSTRAP" | "GBM")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="BOOTSTRAP">Bootstrap historis (default)</option>
                  <option value="GBM">GBM (parametrik)</option>
                </select>
              </Field>
              <Field label="Iterasi (100–5000)"><Input type="number" min="100" max="5000" step="100" value={iterations} onChange={(e) => setIterations(Math.max(100, Math.min(5000, parseInt(e.target.value) || 1000)))} className="h-9" /></Field>
              <Field label="Seed (hasil sama untuk seed sama)"><Input type="number" min="0" value={seed} onChange={(e) => setSeed(Math.max(0, parseInt(e.target.value) || 0))} className="h-9" /></Field>
              <Field label="Target nilai akhir (Rp, opsional)"><Input type="number" min="0" value={target} onChange={(e) => setTarget(parseFloat(e.target.value) || 0)} className="h-9" /></Field>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hasil */}
      <div className="space-y-4 min-w-0">
        <div className="flex gap-1.5 border-b">
          {([["backtest", "Backtest"], ["montecarlo", "Monte Carlo"], ["stress", "Stress Test"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? "border-emerald-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l}</button>
          ))}
          {pending && tab !== "stress" && <span className="ml-auto self-center text-xs text-muted-foreground">Menghitung…</span>}
        </div>

        {tab !== "stress" && !totalOk && <p className="text-sm text-red-500">Total bobot harus 100% (sekarang {total.toFixed(1)}%).</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {tab !== "stress" && noSeries && sim && (
          <Card><CardContent className="p-4 text-sm space-y-1">
            <p className="font-semibold">Simulasi belum bisa dijalankan</p>
            {sim.assumptions.missingData.map((m) => <p key={m} className="text-muted-foreground">{m}</p>)}
          </CardContent></Card>
        )}

        {tab === "backtest" && sim && !noSeries && (
          <>
            <Summary sim={sim} capital={capital} />
            <SimulationChart series={sim.series} benchmarkLabel={bench ? benchmarkLabel(bench) : null} />
            <MetricsCards metrics={sim.metrics} benchmark={sim.benchmarkMetrics} />
            <AssetBreakdown rows={sim.perAsset} />
          </>
        )}

        {tab === "montecarlo" && sim && !noSeries && (
          out?.monteCarlo ? <FanChart result={out.monteCarlo} />
            : <p className="text-sm text-muted-foreground">{out?.monteCarloError ?? "Menghitung…"}</p>
        )}

        {tab === "stress" && <StressPanel />}

        {tab !== "stress" && sim && !noSeries && (
          <div className="text-[11px] text-muted-foreground space-y-1">
            <p>
              Periode data: {sim.assumptions.startDate} s.d. {sim.assumptions.endDate} ({sim.assumptions.months} bulan
              {sim.assumptions.months < sim.assumptions.requestedMonths ? `, kurang dari ${sim.assumptions.requestedMonths} bulan yang diminta` : ""}).
              Harga penutupan tanpa dividen; biaya transaksi {cost}% per sisi.
            </p>
            {sim.assumptions.missingData.map((m) => <p key={m}>⚠ {m}</p>)}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground border-t pt-3">
          Ini simulasi berdasarkan data historis dan asumsi, bukan nasihat investasi. Kinerja masa lalu tidak menjamin hasil di masa depan.
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function Summary({ sim, capital }: { sim: NonNullable<SimulationOutput["simulation"]>; capital: number }) {
  const last = sim.series[sim.series.length - 1]
  const gain = last.portfolio - last.contributions
  const fmt = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v)
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat label="Nilai akhir" value={fmt(last.portfolio)} />
      <Stat label="Total disetor" value={fmt(last.contributions)} />
      <Stat label="Keuntungan" value={fmt(gain)} tone={gain >= 0 ? "pos" : "neg"} />
      <Stat label="Imbal hasil atas setoran" value={last.contributions > 0 ? pct(gain / last.contributions) : "—"} tone={gain >= 0 ? "pos" : "neg"}
        hint={last.benchmark != null ? `Benchmark: ${fmt(last.benchmark)}` : capital ? undefined : undefined} />
    </div>
  )
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "pos" | "neg"; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold tabular-nums ${tone === "neg" ? "text-red-500" : tone === "pos" ? "text-emerald-600" : ""}`}>{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
