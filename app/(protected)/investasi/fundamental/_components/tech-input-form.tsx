"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calculator, Loader2 } from "lucide-react"
import type { TechInput, TechSubsector, TechAnalysisResult } from "@/lib/fundamental/tech-types"
import { TechAnalyzer } from "@/lib/fundamental/tech-analyzer"
import { saveTechAnalysis } from "@/app/actions/fundamental"
import { TechResult } from "./tech-result"

const fieldClass = "flex flex-col gap-1"
const labelClass = "text-xs font-medium text-muted-foreground"
const unitClass  = "text-[10px] text-muted-foreground mt-0.5"
const sectionLabelClass = "text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3"

function Field({ name, label, unit, placeholder, optional, min }: {
  name: string; label: string; unit?: string; placeholder?: string; optional?: boolean; min?: string
}) {
  return (
    <div className={fieldClass}>
      <label htmlFor={name} className={labelClass}>
        {label}{optional && <span className="ml-1 font-normal">(opsional)</span>}
      </label>
      <Input
        id={name} name={name} type="number" step="any"
        min={min ?? "0"} placeholder={placeholder ?? "0"}
        required={!optional} className="h-9"
      />
      {unit && <p className={unitClass}>{unit}</p>}
    </div>
  )
}

function TextField({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <div className={fieldClass}>
      <label htmlFor={name} className={labelClass}>{label}</label>
      <Input id={name} name={name} type="text" placeholder={placeholder} required className="h-9" />
    </div>
  )
}

function num(fd: FormData, key: string): number {
  return parseFloat((fd.get(key) as string) || "0") || 0
}

function numOrNull(fd: FormData, key: string): number | null {
  const s = ((fd.get(key) as string) ?? "").trim()
  if (!s) return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

const analyzer = new TechAnalyzer()

interface Props { subsector: TechSubsector }

export function TechInputForm({ subsector }: Props) {
  const [result, setResult] = useState<TechAnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)
  const router              = useRouter()

  function handleCalc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const input: TechInput = {
      stockCode:  ((fd.get("stockCode") as string) ?? "").toUpperCase().trim(),
      subsector,
      period:     ((fd.get("period")    as string) ?? "").trim(),
      prevPeriod: ((fd.get("prevPeriod") as string) ?? "").trim(),

      revenue:           num(fd, "revenue"),
      cogs:              num(fd, "cogs"),
      operatingIncome:   num(fd, "operatingIncome"),
      netIncome:         num(fd, "netIncome"),
      operatingCashFlow: num(fd, "operatingCashFlow"),
      capex:             num(fd, "capex"),
      da:                numOrNull(fd, "da"),

      prevRevenue:   num(fd, "prevRevenue"),
      prevNetIncome: num(fd, "prevNetIncome"),

      totalAssets:        num(fd, "totalAssets"),
      totalEquity:        num(fd, "totalEquity"),
      totalDebt:          num(fd, "totalDebt"),
      currentAssets:      num(fd, "currentAssets"),
      currentLiabilities: num(fd, "currentLiabilities"),
      interestExpense:    num(fd, "interestExpense"),
      cashAndEquivalents: num(fd, "cashAndEquivalents"),

      stockPrice:        num(fd, "stockPrice"),
      sharesOutstanding: num(fd, "sharesOutstanding"),
      epsOverride:       numOrNull(fd, "epsOverride"),
      bvpsOverride:      numOrNull(fd, "bvpsOverride"),
      growthRate:        num(fd, "growthRate") / 100,
      costOfEquity:      num(fd, "costOfEquity") / 100,

      arr:     subsector === 'saas'      ? numOrNull(fd, "arr")     : null,
      prevArr: subsector === 'saas'      ? numOrNull(fd, "prevArr") : null,
      gmv:     subsector === 'ecommerce' ? numOrNull(fd, "gmv")     : null,
      prevGmv: subsector === 'ecommerce' ? numOrNull(fd, "prevGmv") : null,
    }

    setResult(analyzer.analyze(input))
    setTimeout(() => {
      document.getElementById("tech-result")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const id = await saveTechAnalysis(result)
      router.push(`/investasi/fundamental/tech/${subsector}/${id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCalc} className="space-y-4">
        {/* Identifikasi */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Identifikasi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <TextField name="stockCode"  label="Kode Saham"       placeholder="cth. GOTO" />
              <TextField name="period"     label="Periode Ini"      placeholder="cth. FY 2024" />
              <TextField name="prevPeriod" label="Periode Sebelumnya" placeholder="cth. FY 2023" />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          Nilai moneter dalam <strong>juta rupiah (Rp juta)</strong>. Saham beredar dalam juta lembar. Harga saham dalam IDR per lembar.
        </p>

        {/* Laba Rugi Periode Ini */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Laba Rugi — {"{"}Periode Ini{"}"}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="revenue"           label="Pendapatan (Revenue)"            unit="juta IDR" />
              <Field name="cogs"              label="Harga Pokok (COGS)"              unit="juta IDR" />
              <Field name="operatingIncome"   label="Laba Operasi (EBIT)"             unit="juta IDR" min="-99999999" />
              <Field name="netIncome"         label="Laba Bersih"                     unit="juta IDR" min="-99999999" />
              <Field name="operatingCashFlow" label="Arus Kas Operasi"                unit="juta IDR" min="-99999999" />
              <Field name="capex"             label="CapEx"                           unit="juta IDR" />
              <Field name="da"                label="Depresiasi & Amortisasi"         unit="juta IDR" optional />
            </div>
          </CardContent>
        </Card>

        {/* Laba Rugi Periode Lalu */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Laba Rugi — {"{"}Periode Lalu{"}"} <span className="text-xs font-normal normal-case">(untuk hitung growth)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <Field name="prevRevenue"   label="Pendapatan Periode Lalu" unit="juta IDR" />
              <Field name="prevNetIncome" label="Laba Bersih Periode Lalu" unit="juta IDR" min="-99999999" />
            </div>
          </CardContent>
        </Card>

        {/* Neraca */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Neraca (Balance Sheet)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="totalAssets"        label="Total Aset"                 unit="juta IDR" />
              <Field name="totalEquity"        label="Total Ekuitas"              unit="juta IDR" />
              <Field name="totalDebt"          label="Total Hutang Berbunga"      unit="juta IDR" />
              <Field name="currentAssets"      label="Aset Lancar"                unit="juta IDR" />
              <Field name="currentLiabilities" label="Liabilitas Lancar"          unit="juta IDR" />
              <Field name="cashAndEquivalents" label="Kas & Setara Kas"           unit="juta IDR" />
              <Field name="interestExpense"    label="Beban Bunga"                unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* SaaS-specific */}
        {subsector === 'saas' && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className={sectionLabelClass}>SaaS Metrics</p>
              <div className="grid grid-cols-2 gap-3">
                <Field name="arr"     label="ARR — Periode Ini"       unit="juta IDR" optional />
                <Field name="prevArr" label="ARR — Periode Sebelumnya" unit="juta IDR" optional />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Annual Recurring Revenue — untuk menghitung ARR Growth & EV/ARR</p>
            </CardContent>
          </Card>
        )}

        {/* E-commerce-specific */}
        {subsector === 'ecommerce' && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className={sectionLabelClass}>E-Commerce Metrics</p>
              <div className="grid grid-cols-2 gap-3">
                <Field name="gmv"     label="GMV — Periode Ini"       unit="juta IDR" optional />
                <Field name="prevGmv" label="GMV — Periode Sebelumnya" unit="juta IDR" optional />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Gross Merchandise Value — untuk menghitung GMV Growth & Take Rate</p>
            </CardContent>
          </Card>
        )}

        {/* Valuasi */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Valuasi</p>
            <div className="grid grid-cols-2 gap-3">
              <div className={fieldClass}>
                <label htmlFor="stockPrice" className={labelClass}>Harga Saham</label>
                <Input id="stockPrice" name="stockPrice" type="number" step="1" min="0" placeholder="0" required className="h-9" />
                <p className={unitClass}>IDR per lembar saham</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="sharesOutstanding" className={labelClass}>Saham Beredar</label>
                <Input id="sharesOutstanding" name="sharesOutstanding" type="number" step="any" min="0" placeholder="0" required className="h-9" />
                <p className={unitClass}>juta lembar</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="growthRate" className={labelClass}>Estimasi Pertumbuhan Jangka Panjang (g)</label>
                <Input id="growthRate" name="growthRate" type="number" step="0.1" min="-20" max="50" placeholder="cth. 10" required className="h-9" />
                <p className={unitClass}>% per tahun</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="costOfEquity" className={labelClass}>Cost of Equity (Ke)</label>
                <Input id="costOfEquity" name="costOfEquity" type="number" step="0.1" min="0" max="50" placeholder="cth. 13" required className="h-9" />
                <p className={unitClass}>% per tahun</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="epsOverride" className={labelClass}>EPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="epsOverride" name="epsOverride" type="number" step="any" placeholder="Kosongkan = hitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="bvpsOverride" className={labelClass}>BVPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="bvpsOverride" name="bvpsOverride" type="number" step="any" min="0" placeholder="Kosongkan = hitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg">
          <Calculator className="h-4 w-4 mr-2" />
          Hitung Fundamental
        </Button>
      </form>

      {result && (
        <div id="tech-result" className="pt-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Hasil Analisis</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <TechResult result={result} onSave={handleSave} saving={saving} />
        </div>
      )}
    </div>
  )
}
