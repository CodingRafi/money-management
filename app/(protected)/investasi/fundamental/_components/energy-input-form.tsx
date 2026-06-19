"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calculator, Loader2 } from "lucide-react"
import type { EnergyInput, EnergySubsector, EnergyAnalysisResult } from "@/lib/fundamental/energy-types"
import { EnergyAnalyzer } from "@/lib/fundamental/energy-analyzer"
import { saveEnergyAnalysis } from "@/app/actions/fundamental"
import { EnergyResult } from "./energy-result"

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

const analyzer = new EnergyAnalyzer()

interface Props { subsector: EnergySubsector }

export function EnergyInputForm({ subsector }: Props) {
  const [result, setResult] = useState<EnergyAnalysisResult | null>(null)
  const [saving, setSaving] = useState(false)
  const router              = useRouter()

  function handleCalc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const input: EnergyInput = {
      stockCode:  ((fd.get("stockCode") as string) ?? "").toUpperCase().trim(),
      subsector,
      period:     ((fd.get("period")    as string) ?? "").trim(),
      prevPeriod: ((fd.get("prevPeriod") as string) ?? "").trim(),

      revenue:           num(fd, "revenue"),
      cogs:              num(fd, "cogs"),
      ebitda:            numOrNull(fd, "ebitda"),
      operatingIncome:   num(fd, "operatingIncome"),
      netIncome:         num(fd, "netIncome"),
      operatingCashFlow: num(fd, "operatingCashFlow"),
      capex:             num(fd, "capex"),
      da:                numOrNull(fd, "da"),
      interestExpense:   num(fd, "interestExpense"),

      prevRevenue: num(fd, "prevRevenue"),

      totalAssets:        num(fd, "totalAssets"),
      totalEquity:        num(fd, "totalEquity"),
      totalDebt:          num(fd, "totalDebt"),
      currentAssets:      num(fd, "currentAssets"),
      currentLiabilities: num(fd, "currentLiabilities"),
      cashAndEquivalents: num(fd, "cashAndEquivalents"),

      stockPrice:        num(fd, "stockPrice"),
      sharesOutstanding: num(fd, "sharesOutstanding"),
      epsOverride:       numOrNull(fd, "epsOverride"),
      bvpsOverride:      numOrNull(fd, "bvpsOverride"),

      // Migas
      totalReserves:        subsector === 'migas' ? numOrNull(fd, "totalReserves")        : null,
      annualProduction:     subsector === 'migas' ? numOrNull(fd, "annualProduction")     : null,
      prevAnnualProduction: subsector === 'migas' ? numOrNull(fd, "prevAnnualProduction") : null,

      // Batubara
      productionVolume:     subsector === 'batubara' ? numOrNull(fd, "productionVolume")     : null,
      prevProductionVolume: subsector === 'batubara' ? numOrNull(fd, "prevProductionVolume") : null,
      avgSellingPrice:      subsector === 'batubara' ? numOrNull(fd, "avgSellingPrice")      : null,
      cashCostPerTon:       subsector === 'batubara' ? numOrNull(fd, "cashCostPerTon")       : null,

      // EBT
      installedCapacity:   subsector === 'ebt' ? numOrNull(fd, "installedCapacity")   : null,
      energyGenerated:     subsector === 'ebt' ? numOrNull(fd, "energyGenerated")     : null,
      prevEnergyGenerated: subsector === 'ebt' ? numOrNull(fd, "prevEnergyGenerated") : null,
    }

    setResult(analyzer.analyze(input))
    setTimeout(() => {
      document.getElementById("energy-result")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const id = await saveEnergyAnalysis(result)
      router.push(`/investasi/fundamental/energy/${subsector}/${id}`)
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
              <TextField name="stockCode"  label="Kode Saham"          placeholder="cth. ADRO" />
              <TextField name="period"     label="Periode Ini"         placeholder="cth. FY 2024" />
              <TextField name="prevPeriod" label="Periode Sebelumnya"  placeholder="cth. FY 2023" />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground px-1">
          Nilai moneter dalam <strong>juta rupiah (Rp juta)</strong>. Saham beredar dalam juta lembar. Harga saham dalam IDR per lembar.
        </p>

        {/* Laba Rugi Periode Ini */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Laba Rugi — Periode Ini</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="revenue"           label="Pendapatan (Revenue)"     unit="juta IDR" />
              <Field name="cogs"              label="Harga Pokok (COGS)"       unit="juta IDR" />
              <Field name="ebitda"            label="EBITDA"                   unit="juta IDR" optional
                placeholder="Kosongkan = EBIT + D&A" />
              <Field name="operatingIncome"   label="Laba Operasi (EBIT)"      unit="juta IDR" min="-99999999" />
              <Field name="netIncome"         label="Laba Bersih"              unit="juta IDR" min="-99999999" />
              <Field name="da"                label="Depresiasi & Amortisasi"  unit="juta IDR" optional />
              <Field name="operatingCashFlow" label="Arus Kas Operasi"         unit="juta IDR" min="-99999999" />
              <Field name="capex"             label="CapEx"                    unit="juta IDR" />
              <Field name="interestExpense"   label="Beban Bunga"              unit="juta IDR" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Jika EBITDA diisi langsung, field D&A diabaikan untuk perhitungan EBITDA.
            </p>
          </CardContent>
        </Card>

        {/* Laba Rugi Periode Lalu */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Laba Rugi — Periode Lalu <span className="text-xs font-normal normal-case">(untuk hitung revenue growth)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <Field name="prevRevenue" label="Pendapatan Periode Lalu" unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Neraca */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Neraca (Balance Sheet)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="totalAssets"        label="Total Aset"             unit="juta IDR" />
              <Field name="totalEquity"        label="Total Ekuitas"          unit="juta IDR" />
              <Field name="totalDebt"          label="Total Hutang Berbunga"  unit="juta IDR" />
              <Field name="currentAssets"      label="Aset Lancar"            unit="juta IDR" />
              <Field name="currentLiabilities" label="Liabilitas Lancar"      unit="juta IDR" />
              <Field name="cashAndEquivalents" label="Kas & Setara Kas"       unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Migas-specific */}
        {subsector === 'migas' && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className={sectionLabelClass}>Cadangan & Produksi (Migas)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field name="totalReserves"        label="Total Cadangan (Reserves)"   unit="MMBOE" optional />
                <Field name="annualProduction"     label="Produksi Tahun Ini"          unit="MMBOE/tahun" optional />
                <Field name="prevAnnualProduction" label="Produksi Tahun Sebelumnya"   unit="MMBOE/tahun" optional />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                MMBOE = juta barrel oil equivalent. RLI = Reserves / Annual Production (tahun). Jika diisi, akan masuk scoring Operasional.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Batubara-specific */}
        {subsector === 'batubara' && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className={sectionLabelClass}>Data Produksi & Biaya (Batu Bara)</p>
              <div className="grid grid-cols-2 gap-3">
                <Field name="productionVolume"     label="Volume Produksi Tahun Ini"        unit="juta ton" optional />
                <Field name="prevProductionVolume" label="Volume Produksi Tahun Sebelumnya" unit="juta ton" optional />
                <Field name="avgSellingPrice"      label="Average Selling Price (ASP)"      unit="USD/ton"  optional />
                <Field name="cashCostPerTon"       label="Cash Cost"                        unit="USD/ton"  optional />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                ASP/Cash Cost Ratio &gt; 1.8× menunjukkan margin operasional yang kuat.
              </p>
            </CardContent>
          </Card>
        )}

        {/* EBT-specific */}
        {subsector === 'ebt' && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <p className={sectionLabelClass}>Data Kapasitas & Pembangkitan (EBT)</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field name="installedCapacity"   label="Kapasitas Terpasang"        unit="MW"      optional />
                <Field name="energyGenerated"     label="Energi Dibangkitkan Tahun Ini"       unit="GWh/tahun" optional />
                <Field name="prevEnergyGenerated" label="Energi Dibangkitkan Tahun Lalu" unit="GWh/tahun" optional />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Capacity Factor = GWh / (MW × 8.760). Geothermal biasanya 80–90%, solar 15–25%, angin 25–40%.
              </p>
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
        <div id="energy-result" className="pt-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Hasil Analisis</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <EnergyResult result={result} onSave={handleSave} saving={saving} />
        </div>
      )}
    </div>
  )
}
