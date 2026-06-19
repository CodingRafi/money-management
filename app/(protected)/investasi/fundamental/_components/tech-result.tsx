"use client"

import type { TechAnalysisResult, TechRatioResult } from "@/lib/fundamental/tech-types"
import { getTechConfig, type TechRatioKey } from "@/lib/fundamental/tech-config"
import { TECH_SUBSECTOR_LABELS } from "@/lib/fundamental/tech-types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"

interface Props {
  result:  TechAnalysisResult
  onSave?: () => void
  saving?: boolean
}

function scoreColor(s: number | null) {
  if (s === null) return "text-muted-foreground"
  if (s >= 80) return "text-emerald-600"
  if (s >= 65) return "text-blue-600"
  if (s >= 50) return "text-yellow-600"
  if (s >= 35) return "text-orange-600"
  return "text-red-600"
}

function scoreBg(s: number | null) {
  if (s === null) return "bg-muted"
  if (s >= 80) return "bg-emerald-500"
  if (s >= 65) return "bg-blue-500"
  if (s >= 50) return "bg-yellow-500"
  if (s >= 35) return "bg-orange-500"
  return "bg-red-500"
}

function labelBg(label: string) {
  const m: Record<string, string> = {
    "Sangat Baik":      "bg-emerald-100 text-emerald-800",
    "Baik":             "bg-blue-100 text-blue-800",
    "Cukup Baik":       "bg-yellow-100 text-yellow-800",
    "Perlu Perhatian":  "bg-orange-100 text-orange-800",
    "Berisiko Tinggi":  "bg-red-100 text-red-800",
  }
  return m[label] ?? "bg-muted text-muted-foreground"
}

function pct(v: number | null, d = 2) {
  return v === null ? "N/A" : `${(v * 100).toFixed(d)}%`
}
function multi(v: number | null) {
  return v === null ? "N/A" : `${v.toFixed(2)}×`
}
function ratio(v: number | null) {
  return v === null ? "N/A" : v.toFixed(2)
}

const RATIO_LABELS: Partial<Record<TechRatioKey, string>> = {
  grossMargin:     "Gross Margin",
  operatingMargin: "Operating Margin",
  netMargin:       "Net Margin",
  roe:             "ROE",
  revenueGrowth:   "Revenue Growth YoY",
  epsGrowth:       "EPS Growth YoY",
  fcfMargin:       "FCF Margin",
  opCfMargin:      "Op. CF Margin",
  debtToEquity:    "Debt-to-Equity",
  currentRatio:    "Current Ratio",
  interestCoverage: "Interest Coverage",
  pe:              "P/E Ratio",
  pb:              "P/B Ratio",
  ps:              "P/S Ratio",
  peg:             "PEG Ratio",
  evRevenue:       "EV/Revenue",
  evEbitda:        "EV/EBITDA",
  arrGrowth:       "ARR Growth YoY",
  ruleOf40:        "Rule of 40",
  gmvGrowth:       "GMV Growth YoY",
  takeRate:        "Take Rate",
}

type FmtType = 'pct' | 'multi' | 'ratio'

const RATIO_FORMAT: Partial<Record<TechRatioKey, FmtType>> = {
  grossMargin: 'pct', operatingMargin: 'pct', netMargin: 'pct', roe: 'pct',
  revenueGrowth: 'pct', epsGrowth: 'pct', fcfMargin: 'pct', opCfMargin: 'pct',
  debtToEquity: 'ratio', currentRatio: 'ratio', interestCoverage: 'ratio',
  pe: 'multi', pb: 'multi', ps: 'multi', peg: 'multi',
  evRevenue: 'multi', evEbitda: 'multi',
  arrGrowth: 'pct', ruleOf40: 'pct', gmvGrowth: 'pct', takeRate: 'pct',
}

function fmt(key: TechRatioKey, v: number | null): string {
  const t = RATIO_FORMAT[key] ?? 'ratio'
  if (t === 'pct')   return pct(v)
  if (t === 'multi') return multi(v)
  return ratio(v)
}

function RatioRow({ ratioKey, result, note }: { ratioKey: TechRatioKey; result: TechRatioResult; note?: string }) {
  const { value, score } = result
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-sm">
        {RATIO_LABELS[ratioKey] ?? ratioKey}
        {note && <span className="ml-1 text-xs text-muted-foreground">({note})</span>}
      </td>
      <td className="px-3 py-2 text-sm text-right tabular-nums font-medium">
        {fmt(ratioKey, value)}
      </td>
      <td className="px-3 py-2 w-32">
        {score !== null ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${scoreBg(score)}`} style={{ width: `${score}%` }} />
            </div>
            <span className={`text-xs font-semibold tabular-nums w-8 text-right ${scoreColor(score)}`}>
              {score.toFixed(0)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">N/A</span>
        )}
      </td>
    </tr>
  )
}

const CATEGORY_LABELS = {
  profitability: "Profitabilitas",
  growth:        "Pertumbuhan",
  cashFlow:      "Kualitas Arus Kas",
  balanceSheet:  "Kesehatan Neraca",
  valuation:     "Valuasi",
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
      <div className={`h-full rounded-full ${scoreBg(score)}`} style={{ width: `${score}%` }} />
    </div>
  )
}

export function TechResult({ result, onSave, saving }: Props) {
  const { compositeScore, label, ratios, categoryScores, input, subsector } = result
  const config = getTechConfig(subsector)
  const { categoryRatios } = config

  const categories = [
    { key: 'profitability' as const, ...categoryScores.profitability },
    { key: 'growth'        as const, ...categoryScores.growth },
    { key: 'cashFlow'      as const, ...categoryScores.cashFlow },
    { key: 'balanceSheet'  as const, ...categoryScores.balanceSheet },
    { key: 'valuation'     as const, ...categoryScores.valuation },
  ]

  // Informatif-only ratios (tidak diskor, tapi ditampilkan)
  const infoRatios: { key: TechRatioKey; note: string }[] = [
    { key: 'pe',     note: "informatif" },
    { key: 'pb',     note: "informatif" },
    { key: 'evEbitda', note: "informatif" },
  ]

  const idr = (v: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v)

  return (
    <div className="space-y-4">
      {/* Skor Komposit */}
      <Card className="overflow-hidden">
        <div className={`h-2 ${scoreBg(compositeScore)}`} />
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Skor Komposit</p>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl font-black tabular-nums ${scoreColor(compositeScore)}`}>
                  {compositeScore.toFixed(1)}
                </span>
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${labelBg(label)}`}>
                  {label}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{input.stockCode}</p>
              <p className="text-xs text-muted-foreground">{input.period} vs {input.prevPeriod}</p>
              <p className="text-xs text-muted-foreground">{TECH_SUBSECTOR_LABELS[subsector]}</p>
              {onSave && (
                <Button onClick={onSave} disabled={saving} size="sm" className="mt-2">
                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                  Simpan Analisis
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skor per Kategori */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {categories.map(({ key, score, weight, validCount, totalCount }) => (
          <Card key={key}>
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{CATEGORY_LABELS[key]}</p>
              <p className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(1)}</p>
              <ScoreBar score={score} />
              <p className="text-[10px] text-muted-foreground mt-1">
                {(weight * 100).toFixed(0)}% · {validCount}/{totalCount} rasio
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Derived values */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nilai Turunan</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">EPS</p>
              <p className="font-semibold tabular-nums">
                {result.ratioValues.eps !== 0 ? `${idr(result.ratioValues.eps)}/saham` : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">BVPS</p>
              <p className="font-semibold tabular-nums">
                {result.ratioValues.bvps !== 0 ? `${idr(result.ratioValues.bvps)}/saham` : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Market Cap</p>
              <p className="font-semibold tabular-nums">{idr(result.ratioValues.marketCap)} jt</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Enterprise Value</p>
              <p className="font-semibold tabular-nums">{idr(result.ratioValues.ev)} jt</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Rasio */}
      <Card>
        <CardContent className="p-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b">
            Detail Rasio
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground border-b">
                  <th className="px-3 py-2 text-left font-medium">Rasio</th>
                  <th className="px-3 py-2 text-right font-medium">Nilai</th>
                  <th className="px-3 py-2 text-left font-medium w-36">Skor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(Object.entries(categoryRatios) as [keyof typeof CATEGORY_LABELS, TechRatioKey[]][]).map(([cat, keys]) => (
                  <>
                    <tr key={cat} className="bg-muted/20">
                      <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {CATEGORY_LABELS[cat]} ({(config.categoryWeights[cat] * 100).toFixed(0)}%)
                      </td>
                    </tr>
                    {keys.map((key) => (
                      <RatioRow key={key} ratioKey={key} result={ratios[key]} />
                    ))}
                  </>
                ))}

                {/* Informatif */}
                <tr className="bg-muted/20">
                  <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Informatif (tidak masuk scoring)
                  </td>
                </tr>
                {infoRatios.map(({ key, note }) =>
                  ratios[key].value !== null && ratios[key].value !== 0 ? (
                    <RatioRow key={key} ratioKey={key} result={ratios[key]} note={note} />
                  ) : null
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
