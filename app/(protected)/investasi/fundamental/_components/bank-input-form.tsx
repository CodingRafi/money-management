"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Calculator, Loader2 } from "lucide-react"
import type { BankInput, BankAnalysisResult } from "@/lib/fundamental/types"
import { BankAnalyzer } from "@/lib/fundamental/bank-analyzer"
import { saveAnalysis } from "@/app/actions/fundamental"
import { BankResult } from "./bank-result"

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

export function BankInputForm() {
  const [result, setResult]   = useState<BankAnalysisResult | null>(null)
  const [saving, setSaving]   = useState(false)
  const router                = useRouter()
  const analyzer              = new BankAnalyzer()

  function handleCalc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    const input: BankInput = {
      stockCode:         ((fd.get("stockCode") as string) ?? "").toUpperCase().trim(),
      period:            ((fd.get("period")    as string) ?? "").trim(),
      totalAssets:       num(fd, "totalAssets"),
      totalEquity:       num(fd, "totalEquity"),
      netIncome:         num(fd, "netIncome"),
      interestIncome:    num(fd, "interestIncome"),
      interestExpense:   num(fd, "interestExpense"),
      avgEarningAssets:  num(fd, "avgEarningAssets"),
      operatingExpense:  num(fd, "operatingExpense"),
      operatingIncome:   num(fd, "operatingIncome"),
      grossLoans:        num(fd, "grossLoans"),
      nplGrossNominal:   num(fd, "nplGrossNominal"),
      ckpn:              num(fd, "ckpn"),
      tier1Capital:      num(fd, "tier1Capital"),
      tier2Capital:      num(fd, "tier2Capital"),
      rwa:               num(fd, "rwa"),
      totalDpk:          num(fd, "totalDpk"),
      currentAccount:    num(fd, "currentAccount"),
      savings:           num(fd, "savings"),
      stockPrice:        num(fd, "stockPrice"),
      sharesOutstanding: num(fd, "sharesOutstanding"),
      epsOverride:       numOrNull(fd, "epsOverride"),
      bvpsOverride:      numOrNull(fd, "bvpsOverride"),
      growthRate:        num(fd, "growthRate") / 100,
      costOfEquity:      num(fd, "costOfEquity") / 100,
    }

    setResult(analyzer.analyze(input))
    setTimeout(() => {
      document.getElementById("fundamental-result")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 80)
  }

  async function handleSave() {
    if (!result) return
    setSaving(true)
    try {
      const id = await saveAnalysis(result)
      router.push(`/investasi/fundamental/bank/${id}`)
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
                <Input id="stockCode" name="stockCode" type="text" placeholder="cth. BBCA" required className="h-9 uppercase" />
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
            <div className="grid grid-cols-2 gap-3">
              <Field name="totalAssets" label="Total Aset"   unit="juta IDR" />
              <Field name="totalEquity" label="Total Ekuitas" unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Laba Rugi */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Laba Rugi</p>
            <div className="grid grid-cols-2 gap-3">
              <Field name="netIncome"        label="Laba Bersih"          unit="juta IDR" />
              <Field name="avgEarningAssets" label="Rata-rata Aset Produktif" unit="juta IDR"
                placeholder="(Aset produktif awal + akhir) / 2" />
              <Field name="interestIncome"   label="Pendapatan Bunga"    unit="juta IDR" />
              <Field name="interestExpense"  label="Beban Bunga"         unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Efisiensi */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Efisiensi Operasional</p>
            <div className="grid grid-cols-2 gap-3">
              <Field name="operatingExpense" label="Total Beban Operasional"   unit="juta IDR" />
              <Field name="operatingIncome"  label="Total Pendapatan Operasional" unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Kualitas Kredit */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Kualitas Kredit</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="grossLoans"      label="Total Kredit (Gross)" unit="juta IDR" />
              <Field name="nplGrossNominal" label="Kredit Bermasalah (NPL Gross)" unit="juta IDR" />
              <Field name="ckpn"            label="CKPN"                  unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Permodalan */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Permodalan</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="tier1Capital" label="Modal Tier 1" unit="juta IDR" />
              <Field name="tier2Capital" label="Modal Tier 2" unit="juta IDR" />
              <Field name="rwa"          label="ATMR"         unit="juta IDR" />
            </div>
          </CardContent>
        </Card>

        {/* Likuiditas & DPK */}
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <p className={sectionLabelClass}>Likuiditas & Dana Pihak Ketiga</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field name="totalDpk"      label="Total DPK" unit="juta IDR" />
              <Field name="currentAccount" label="Giro"      unit="juta IDR" />
              <Field name="savings"        label="Tabungan"   unit="juta IDR" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              LDR dihitung dari Total Kredit / Total DPK. CASA = (Giro + Tabungan) / Total DPK.
            </p>
          </CardContent>
        </Card>

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
                <label htmlFor="growthRate" className={labelClass}>Estimasi Pertumbuhan (g)</label>
                <Input id="growthRate" name="growthRate" type="number" step="0.1" min="-20" max="50" placeholder="cth. 10" required className="h-9" />
                <p className={unitClass}>% per tahun (untuk Justified PBV)</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="costOfEquity" className={labelClass}>Cost of Equity (Ke)</label>
                <Input id="costOfEquity" name="costOfEquity" type="number" step="0.1" min="0" max="50" placeholder="cth. 13" required className="h-9" />
                <p className={unitClass}>% per tahun (harus lebih besar dari g)</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="epsOverride" className={labelClass}>EPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="epsOverride" name="epsOverride" type="number" step="any" min="0" placeholder="Kosongkan untuk dihitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham — jika diisi, mengganti hasil perhitungan</p>
              </div>
              <div className={fieldClass}>
                <label htmlFor="bvpsOverride" className={labelClass}>BVPS Override <span className="font-normal">(opsional)</span></label>
                <Input id="bvpsOverride" name="bvpsOverride" type="number" step="any" min="0" placeholder="Kosongkan untuk dihitung otomatis" className="h-9" />
                <p className={unitClass}>IDR per saham — jika diisi, mengganti hasil perhitungan</p>
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
        <div id="fundamental-result" className="pt-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Hasil Analisis</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <BankResult result={result} onSave={handleSave} saving={saving} />
        </div>
      )}
    </div>
  )
}
