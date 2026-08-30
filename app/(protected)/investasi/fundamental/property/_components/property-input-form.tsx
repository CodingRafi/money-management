"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calculator, Loader2 } from "lucide-react"
import type { PropertyInput, PropertyAnalysisResult } from "@/lib/fundamental/property-types"
import { PropertyAnalyzer } from "@/lib/fundamental/property-analyzer"
import { savePropertyAnalysis } from "@/app/actions/fundamental"
import { PropertyResult } from "./property-result"

const fieldClass = "flex flex-col gap-1"
const labelClass = "text-xs font-medium text-muted-foreground"
const unitClass  = "text-[10px] text-muted-foreground mt-0.5"
const sectionLabelClass = "text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3"

function Field({ name, label, unit, placeholder, optional }: {
  name: string; label: string; unit?: string; placeholder?: string; optional?: boolean
}) {
  return (
    <div className={fieldClass}>
      <label htmlFor={name} className={labelClass}>
        {label}{optional && <span className="ml-1 font-normal">(opsional)</span>}
      </label>
      <Input
        id={name}
        name={name}
        type="number"
        step="any"
        min="0"
        placeholder={placeholder ?? "0"}
        required={!optional}
        className="h-9"
      />
      {unit && <p className={unitClass}>{unit}</p>}
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

export function PropertyInputForm() {
  const [result, setResult]   = useState<PropertyAnalysisResult | null>(null)
  const [saving, setSaving]   = useState(false)
  const router                = useRouter()
  const analyzer              = new PropertyAnalyzer()

  function handleCalc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const input: PropertyInput = {
      stockCode:         ((fd.get("stockCode") as string) ?? "").toUpperCase().trim(),
      period:            ((fd.get("period")    as string) ?? "").trim(),
      // Neraca
      totalAssets:       num(fd, "totalAssets"),
      totalEquity:       num(fd, "totalEquity"),
      currentAssets:     num(fd, "currentAssets"),
      currentLiabilities: num(fd, "currentLiabilities"),
      inventory:         num(fd, "inventory"),
      totalDebt:         num(fd, "totalDebt"),
      totalLiabilities:  num(fd, "totalLiabilities"),
      // Laba Rugi
      revenue:           num(fd, "revenue"),
      grossProfit:       num(fd, "grossProfit"),
      operatingIncome:  num(fd, "operatingIncome"),
      netIncome:         num(fd, "netIncome"),
      interestExpense:   num(fd, "interestExpense"),
      // Saham & Valuasi
      stockPrice:        num(fd, "stockPrice"),
      sharesOutstanding: num(fd, "sharesOutstanding"),
      dividendPerShare:  num(fd, "dividendPerShare"),
      epsOverride:       numOrNull(fd, "epsOverride"),
      bvpsOverride:      numOrNull(fd, "bvpsOverride"),
      navpsOverride:     numOrNull(fd, "navpsOverride"),
      // Properti
      propertyValue:     num(fd, "propertyValue"),
      // Growth
      growthRate:        num(fd, "growthRate") / 100,
      costOfEquity:      num(fd, "costOfEquity") / 100,
    }

    setResult(analyzer.analyze(input))
    setTimeout(() => {
      document.getElementById("property-result")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const id = await savePropertyAnalysis(result)
      router.push(`/investasi/fundamental/property/${id}`)
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
            <div className="grid grid-cols-2 gap-3">
              <div className={fieldClass}>
                <label htmlFor="stockCode" className={labelClass}>Kode Saham</label>
                <Input id="stockCode" name="stockCode" type="text" placeholder="cth. BSDE" required className="h-9 uppercase" />
              </div>
              <div className={fieldClass}>
                <label htmlFor="period" className={labelClass}>Periode Laporan</label>
                <Input id="period" name="period" type="text" placeholder="cth. Q3 2024" required className="h-9" />
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          Semua nilai moneter diisi dalam satuan <strong>juta rupiah (Rp juta)</strong>.
          Saham beredar dalam juta lembar. Harga saham dalam rupiah per lembar.
        </p>

        {/* Neraca */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Neraca (Balance Sheet)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="totalAssets"       label="Total Aset"            unit="juta IDR" />
              <Field name="totalEquity"        label="Total Ekuitas"         unit="juta IDR" />
              <Field name="totalLiabilities"   label="Total Liabilitas"      unit="juta IDR" />
              <Field name="currentAssets"      label="Aset Lancar"           unit="juta IDR" />
              <Field name="currentLiabilities" label="Liabilitas Lancar"     unit="juta IDR" />
              <Field name="inventory"          label="Persediaan"            unit="juta IDR" />
              <Field name="totalDebt"          label="Total Utang"           unit="juta IDR" />
              <Field name="propertyValue"      label="Nilai Pasar Properti"  unit="juta IDR" optional />
              <p className="col-span-full text-[10px] text-muted-foreground -mt-2">
                * Nilai Pasar Properti untuk perhitungan NAV REITs (kosongkan jika tidak ada)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Laba Rugi */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Laba Rugi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="revenue"          label="Pendapatan"           unit="juta IDR" />
              <Field name="grossProfit"      label="Laba Kotor"           unit="juta IDR" />
              <Field name="operatingIncome" label="Laba Operasional"      unit="juta IDR" />
              <Field name="netIncome"       label="Laba Bersih"          unit="juta IDR" />
              <Field name="interestExpense"  label="Beban Bunga"          unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Saham & Valuasi */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Saham & Valuasi</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                <label htmlFor="dividendPerShare" className={labelClass}>Dividen Per Saham</label>
                <Input id="dividendPerShare" name="dividendPerShare" type="number" step="any" min="0" placeholder="0" required className="h-9" />
                <p className={unitClass}>IDR per lembar</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="epsOverride" className={labelClass}>EPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="epsOverride" name="epsOverride" type="number" step="any" min="0" placeholder="Hitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="bvpsOverride" className={labelClass}>BVPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="bvpsOverride" name="bvpsOverride" type="number" step="any" min="0" placeholder="Hitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="navpsOverride" className={labelClass}>NAVPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="navpsOverride" name="navpsOverride" type="number" step="any" min="0" placeholder="Hitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham (untuk REITs)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Growth Assumptions */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Asumsi Pertumbuhan</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={fieldClass}>
                <label htmlFor="growthRate" className={labelClass}>Estimasi Pertumbuhan (g)</label>
                <Input id="growthRate" name="growthRate" type="number" step="0.1" min="-20" max="50" placeholder="cth. 10" required className="h-9" />
                <p className={unitClass}>% per tahun</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="costOfEquity" className={labelClass}>Cost of Equity (Ke)</label>
                <Input id="costOfEquity" name="costOfEquity" type="number" step="0.1" min="0" max="50" placeholder="cth. 13" required className="h-9" />
                <p className={unitClass}>% per tahun</p>
              </div>
              <p className="col-span-2 text-xs text-muted-foreground flex items-center">
                g harus lebih kecil dari Ke untuk perhitungan Justified PBV
              </p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" size="lg">
          <Calculator className="h-4 w-4 mr-2" />
          Hitung Fundamental
        </Button>
      </form>

      {result && (
        <div id="property-result" className="pt-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Hasil Analisis</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <PropertyResult result={result} onSave={handleSave} saving={saving} />
        </div>
      )}
    </div>
  )
}
