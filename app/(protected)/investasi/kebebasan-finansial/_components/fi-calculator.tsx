"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { projectFI } from "@/lib/investment-metrics"

function rp(v: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v)
}
function short(v: number) {
  const a = Math.abs(v)
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}M`
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}jt`
  return String(Math.round(v))
}

function NumField({ label, value, onChange, unit, step = "any" }: {
  label: string; value: number; onChange: (n: number) => void; unit?: string; step?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input type="number" min="0" step={step} value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(parseFloat(e.target.value))} className="h-9" />
      {unit && <p className="text-[10px] text-muted-foreground">{unit}</p>}
    </div>
  )
}

export function FiCalculator({ defaultExpense, defaultCurrent, expenseMonths }: {
  defaultExpense: number; defaultCurrent: number; expenseMonths: number
}) {
  const [expense, setExpense]      = useState(defaultExpense)
  const [current, setCurrent]      = useState(defaultCurrent)
  const [contribution, setContrib] = useState(0)
  const [ret, setRet]              = useState(10)
  const [inflation, setInflation]  = useState(4)
  const [swr, setSwr]              = useState(4)

  const n = (v: number) => (Number.isFinite(v) ? v : 0)

  const calc = useMemo(() => {
    const target = n(swr) > 0 ? (n(expense) * 12) / (n(swr) / 100) : 0
    const proj = projectFI({
      current: n(current), monthlyContribution: n(contribution),
      annualReturn: n(ret) / 100, annualInflation: n(inflation) / 100, target,
    })
    const progress = target > 0 ? Math.min(100, (n(current) / target) * 100) : 0
    const passive = (n(current) * (n(swr) / 100)) / 12
    return { target, proj, progress, passive }
  }, [expense, current, contribution, ret, inflation, swr])

  const { target, proj, progress, passive } = calc
  const years = target > 0 ? proj.yearsToFI : null
  const fiYear = years !== null ? new Date().getFullYear() + Math.ceil(years) : null

  return (
    <div className="space-y-4">
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumField label="Pengeluaran per Bulan" value={expense} onChange={setExpense}
              unit={expenseMonths > 0 ? `Rata-rata ${expenseMonths} bulan terakhir dari rekap (bisa diubah)` : "Belum ada data pengeluaran, isi manual"} />
            <NumField label="Aset Investasi Saat Ini" value={current} onChange={setCurrent} unit="Modal aktif dari portofoliomu" />
            <NumField label="Tambahan Investasi per Bulan" value={contribution} onChange={setContrib} unit="Rp" />
            <NumField label="Estimasi Return per Tahun" value={ret} onChange={setRet} unit="% (nominal)" step="0.1" />
            <NumField label="Inflasi per Tahun" value={inflation} onChange={setInflation} unit="%" step="0.1" />
            <NumField label="Safe Withdrawal Rate" value={swr} onChange={setSwr} unit="% (4% adalah aturan umum)" step="0.1" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Target Dana FI</p>
          <p className="text-lg font-bold tabular-nums">{rp(target)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Pengeluaran × 12 ÷ SWR (nilai hari ini)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Progres</p>
          <p className="text-lg font-bold tabular-nums text-emerald-600">{progress.toFixed(1)}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Estimasi Tercapai</p>
          {target <= 0 ? (
            <p className="text-sm text-muted-foreground mt-1">Isi pengeluaran dan SWR</p>
          ) : years === null ? (
            <p className="text-sm text-red-600 font-medium mt-1">Tidak tercapai dalam 60 tahun</p>
          ) : years === 0 ? (
            <p className="text-lg font-bold text-emerald-600">Sudah tercapai</p>
          ) : (
            <>
              <p className="text-lg font-bold tabular-nums">{years.toFixed(1)} tahun</p>
              <p className="text-[10px] text-muted-foreground mt-1">Sekitar tahun {fiYear}</p>
            </>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Pasif Income Saat Ini</p>
          <p className="text-lg font-bold tabular-nums text-teal-600">{rp(passive)}<span className="text-xs font-normal">/bln</span></p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Menutup {n(expense) > 0 ? Math.min(100, (passive / n(expense)) * 100).toFixed(1) : 0}% pengeluaran
          </p>
        </CardContent></Card>
      </div>

      <Card className="w-full">
        <CardContent className="p-4">
          <p className="text-sm font-semibold mb-1">Proyeksi Aset</p>
          <p className="text-xs text-muted-foreground mb-3">Nilai dalam daya beli hari ini (sudah dikurangi inflasi)</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={proj.series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gFi" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="year" tickFormatter={(y) => `${y}th`} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={52} />
              <Tooltip labelFormatter={(y) => `Tahun ke-${y}`}
                formatter={(v, name) => [rp(Number(v)), name === "nilai" ? "Aset" : "Target FI"]} />
              <Area type="monotone" dataKey="nilai" stroke="#10b981" strokeWidth={2} fill="url(#gFi)" />
              <Line type="monotone" dataKey="target" stroke="#f59e0b" strokeDasharray="5 4" dot={false} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-1">
        Simulasi sederhana, bukan nasihat keuangan. Return aktual berfluktuasi dan tidak dijamin.
      </p>
    </div>
  )
}
