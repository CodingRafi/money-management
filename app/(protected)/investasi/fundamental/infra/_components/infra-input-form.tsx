"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calculator } from "lucide-react"
import type { InfraAnalysisResult, InfraInput, InfraSubsector } from "@/lib/fundamental/infra-types"
import { InfraAnalyzer, INFRA_SUBSECTOR_LABELS, INFRA_OPERATIONAL } from "@/lib/fundamental/infra-analyzer"
import { saveInfraAnalysis } from "@/app/actions/fundamental"
import { InfraResult } from "./infra-result"

const labelClass = "text-xs font-medium text-muted-foreground"
const sectionClass = "text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3"

function Field({ name, label, unit, optional, step = "any", min = "0", placeholder }: {
  name: string; label: string; unit?: string; optional?: boolean; step?: string; min?: string; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className={labelClass}>
        {label}{optional && <span className="ml-1 font-normal">(opsional)</span>}
      </label>
      <Input id={name} name={name} type="number" step={step} min={min}
        placeholder={placeholder ?? "0"} required={!optional} className="h-9" />
      {unit && <p className="text-[10px] text-muted-foreground">{unit}</p>}
    </div>
  )
}

const num = (fd: FormData, k: string) => parseFloat((fd.get(k) as string) || "0") || 0
const numOrNull = (fd: FormData, k: string) => {
  const s = ((fd.get(k) as string) ?? "").trim()
  if (!s) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

export function InfraInputForm() {
  const [subsector, setSubsector] = useState<InfraSubsector>("TOL")
  const [result, setResult] = useState<InfraAnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  function handleCalc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const op = numOrNull(fd, "operational")
    const input: InfraInput = {
      stockCode: ((fd.get("stockCode") as string) ?? "").toUpperCase().trim(),
      period: ((fd.get("period") as string) ?? "").trim(),
      subsector,
      totalAssets: num(fd, "totalAssets"),
      totalEquity: num(fd, "totalEquity"),
      currentAssets: num(fd, "currentAssets"),
      currentLiabilities: num(fd, "currentLiabilities"),
      cash: num(fd, "cash"),
      totalDebt: num(fd, "totalDebt"),
      revenue: num(fd, "revenue"),
      operatingIncome: num(fd, "operatingIncome"),
      ebitda: num(fd, "ebitda"),
      netIncome: num(fd, "netIncome"),
      interestExpense: num(fd, "interestExpense"),
      prevRevenue: num(fd, "prevRevenue"),
      prevNetIncome: num(fd, "prevNetIncome"),
      operatingCashFlow: num(fd, "operatingCashFlow"),
      operational: op === null ? null : subsector === "KONSTRUKSI" ? op : op / 100,
      stockPrice: num(fd, "stockPrice"),
      sharesOutstanding: num(fd, "sharesOutstanding"),
      dividendPerShare: num(fd, "dividendPerShare"),
      growthRate: num(fd, "growthRate") / 100,
      costOfEquity: num(fd, "costOfEquity") / 100,
    }
    setResult(new InfraAnalyzer().analyze(input))
    setTimeout(() => document.getElementById("infra-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80)
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const id = await saveInfraAnalysis(result)
      router.push(`/investasi/fundamental/infra/${id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 w-full">
      <form onSubmit={handleCalc} className="space-y-4 w-full">
        <Card className="w-full">
          <CardContent className="p-4">
            <p className={sectionClass}>Identifikasi</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <label htmlFor="stockCode" className={labelClass}>Kode Saham</label>
                <Input id="stockCode" name="stockCode" placeholder="cth. JSMR" required className="h-9 uppercase" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="period" className={labelClass}>Periode Laporan</label>
                <Input id="period" name="period" placeholder="cth. FY 2024" required className="h-9" />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="subsector" className={labelClass}>Sub-sektor</label>
                <select id="subsector" value={subsector} onChange={(e) => setSubsector(e.target.value as InfraSubsector)}
                  className="h-9 rounded-md border bg-background px-3 text-sm">
                  {(Object.keys(INFRA_SUBSECTOR_LABELS) as InfraSubsector[]).map((k) => (
                    <option key={k} value={k}>{INFRA_SUBSECTOR_LABELS[k]}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          Nilai moneter dalam <strong>juta rupiah</strong>, saham beredar dalam <strong>juta lembar</strong>, harga saham dalam rupiah per lembar.
        </p>

        <Card className="w-full">
          <CardContent className="p-4">
            <p className={sectionClass}>Neraca</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field name="totalAssets" label="Total Aset" unit="juta IDR" />
              <Field name="totalEquity" label="Total Ekuitas" unit="juta IDR" />
              <Field name="currentAssets" label="Aset Lancar" unit="juta IDR" />
              <Field name="currentLiabilities" label="Liabilitas Lancar" unit="juta IDR" />
              <Field name="cash" label="Kas & Setara Kas" unit="juta IDR" />
              <Field name="totalDebt" label="Total Utang Berbunga" unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardContent className="p-4">
            <p className={sectionClass}>Laba Rugi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field name="revenue" label="Pendapatan" unit="juta IDR" />
              <Field name="operatingIncome" label="Laba Operasional (EBIT)" unit="juta IDR" />
              <Field name="ebitda" label="EBITDA" unit="juta IDR" />
              <Field name="netIncome" label="Laba Bersih" unit="juta IDR" min="-1000000000" />
              <Field name="interestExpense" label="Beban Bunga" unit="juta IDR" />
              <Field name="operatingCashFlow" label="Arus Kas Operasi (CFO)" unit="juta IDR" min="-1000000000" />
              <Field name="prevRevenue" label="Pendapatan Periode Sebelumnya" unit="juta IDR, untuk growth" />
              <Field name="prevNetIncome" label="Laba Bersih Periode Sebelumnya" unit="juta IDR, untuk growth" />
            </div>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardContent className="p-4">
            <p className={sectionClass}>Operasional ({INFRA_SUBSECTOR_LABELS[subsector]})</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field key={subsector} name="operational" label={INFRA_OPERATIONAL[subsector].label} unit={INFRA_OPERATIONAL[subsector].unit} optional step="0.1" min={subsector === "TOL" ? "-100" : "0"} placeholder="Lewati bila tidak ada" />
            </div>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardContent className="p-4">
            <p className={sectionClass}>Saham & Valuasi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Field name="stockPrice" label="Harga Saham" unit="IDR per lembar" step="1" />
              <Field name="sharesOutstanding" label="Saham Beredar" unit="juta lembar" />
              <Field name="dividendPerShare" label="Dividen per Saham" unit="IDR per lembar" />
              <Field name="growthRate" label="Estimasi Pertumbuhan (g)" unit="% per tahun" step="0.1" min="-20" placeholder="cth. 8" />
              <Field name="costOfEquity" label="Cost of Equity (Ke)" unit="% per tahun" step="0.1" placeholder="cth. 12" />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg">
          <Calculator className="h-4 w-4 mr-2" />Hitung Fundamental
        </Button>
      </form>

      {result && (
        <div id="infra-result" className="pt-2 w-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Hasil Analisis</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <InfraResult result={result} onSave={handleSave} saving={saving} />
        </div>
      )}
    </div>
  )
}
