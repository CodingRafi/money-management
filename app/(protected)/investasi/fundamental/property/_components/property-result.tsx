"use client"

import { PropertyAnalysisResult, RatioResult } from "@/lib/fundamental/property-types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"
import {
  PROPERTY_CATEGORY_LABELS,
  PROPERTY_RATIO_SECTIONS,
  PROPERTY_RATIO_LABELS,
  getPropertyLabelClass,
} from "@/lib/fundamental/property-config"

interface Props {
  result: PropertyAnalysisResult
  onSave?: () => void
  saving?: boolean
}

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-600"
  if (s >= 65) return "text-blue-600"
  if (s >= 50) return "text-yellow-600"
  if (s >= 35) return "text-orange-600"
  return "text-red-600"
}

function scoreBg(s: number) {
  if (s >= 80) return "bg-emerald-500"
  if (s >= 65) return "bg-blue-500"
  if (s >= 50) return "bg-yellow-500"
  if (s >= 35) return "bg-orange-500"
  return "bg-red-500"
}

function formatPct(v: number, decimals = 2) {
  return `${(v * 100).toFixed(decimals)}%`
}

function formatMulti(v: number) {
  return `${v.toFixed(2)}×`
}

function formatIdr(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v)
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all ${scoreBg(score)}`} style={{ width: `${score}%` }} />
    </div>
  )
}

function RatioRow({
  label,
  result,
  format,
  note,
}: {
  label: string
  result: RatioResult
  format: (v: number) => string
  note?: string
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2 text-sm">
        {label}
        {note && <span className="ml-1 text-xs text-muted-foreground">({note})</span>}
      </td>
      <td className="px-3 py-2 text-sm text-right tabular-nums font-medium">{format(result.value)}</td>
      <td className="px-3 py-2 w-32">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${scoreBg(result.score)}`} style={{ width: `${result.score}%` }} />
          </div>
          <span className={`text-xs font-semibold tabular-nums w-8 text-right ${scoreColor(result.score)}`}>
            {result.score.toFixed(0)}
          </span>
        </div>
      </td>
    </tr>
  )
}

const RATIO_FORMATTERS: Record<string, (v: number) => string> = {
  gpm: formatPct,
  npm: formatPct,
  roa: formatPct,
  roe: formatPct,
  der: formatMulti,
  debtToAsset: formatPct,
  interestCoverage: v => `${v.toFixed(2)}×`,
  currentRatio: v => `${v.toFixed(2)}×`,
  quickRatio: v => `${v.toFixed(2)}×`,
  pbv: formatMulti,
  per: formatMulti,
  dividendYield: formatPct,
  navYield: formatPct,
  assetGrowth: formatPct,
  equityGrowth: formatPct,
}

export function PropertyResult({ result, onSave, saving }: Props) {
  const { compositeScore, label, ratios, categoryScores, derivedValues } = result

  const categories = [
    { key: "profitability", ...categoryScores.profitability },
    { key: "leverage", ...categoryScores.leverage },
    { key: "liquidity", ...categoryScores.liquidity },
    { key: "valuation", ...categoryScores.valuation },
    { key: "growth", ...categoryScores.growth },
  ] as const

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
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${getPropertyLabelClass(compositeScore)}`}>
                  {label}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{result.input.stockCode}</p>
              <p className="text-xs text-muted-foreground">{result.input.period}</p>
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
        {categories.map(({ key, score, weight }) => (
          <Card key={key}>
            <CardContent className="p-3">
              <p className="text-[11px] text-muted-foreground mb-1">{PROPERTY_CATEGORY_LABELS[key]}</p>
              <p className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(1)}</p>
              <ScoreBar score={score} />
              <p className="text-[10px] text-muted-foreground mt-1">{(weight * 100).toFixed(0)}% bobot</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Nilai Turunan & Valuasi */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nilai Turunan & Valuasi</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">EPS</p>
              <p className="font-semibold tabular-nums">{formatIdr(derivedValues.eps)}/saham</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">BVPS</p>
              <p className="font-semibold tabular-nums">{formatIdr(derivedValues.bvps)}/saham</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">NAVPS</p>
              <p className="font-semibold tabular-nums">{formatIdr(derivedValues.navps)}/saham</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Dividen/Tahun</p>
              <p className="font-semibold tabular-nums">{formatIdr(derivedValues.dividendPerYear)}jt</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Justified PBV</p>
              <p className="font-semibold tabular-nums">
                {derivedValues.justifiedPbv > 0 ? formatMulti(derivedValues.justifiedPbv) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">PBV Aktual</p>
              <p className="font-semibold tabular-nums">
                {ratios.pbv.value > 0 ? formatMulti(ratios.pbv.value) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Margin of Safety</p>
              <p className={`font-semibold tabular-nums ${derivedValues.marginOfSafety > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {derivedValues.justifiedPbv > 0 ? formatPct(derivedValues.marginOfSafety) : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">P/E Ratio</p>
              <p className="font-semibold tabular-nums">
                {derivedValues.pe > 0 ? `${derivedValues.pe.toFixed(1)}×` : "N/A"}
              </p>
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
                {Object.entries(PROPERTY_RATIO_SECTIONS).map(([sectionName, ratioKeys]) => (
                  <>
                    <tr key={`header-${sectionName}`} className="bg-muted/20">
                      <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {sectionName}
                      </td>
                    </tr>
                    {ratioKeys.map(key => {
                      const ratio = ratios[key as keyof typeof ratios] as RatioResult
                      const meta = PROPERTY_RATIO_LABELS[key]
                      const formatFn = RATIO_FORMATTERS[key] ?? (v => v.toFixed(2))
                      return (
                        <RatioRow
                          key={key}
                          label={meta?.label ?? key}
                          result={ratio}
                          format={formatFn}
                          note={meta?.note}
                        />
                      )
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
