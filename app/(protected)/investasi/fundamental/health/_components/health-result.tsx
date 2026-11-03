"use client"

import { Fragment } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Save, Loader2 } from "lucide-react"
import type { HealthAnalysisResult, HealthCategoryKey } from "@/lib/fundamental/health-types"
import {
  HEALTH_CATEGORY_LABELS, HEALTH_RATIO_META, HEALTH_RATIO_SECTIONS, HEALTH_SUBSECTOR_LABELS,
  getHealthLabelClass,
} from "@/lib/fundamental/health-analyzer"

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
const pct = (v: number) => `${(v * 100).toFixed(2)}%`
const mult = (v: number) => `${v.toFixed(2)}×`
const idr = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v)

const CATEGORY_ORDER: HealthCategoryKey[] = ["profitability", "growth", "valuation", "leverage", "liquidity"]

export function HealthResult({ result, onSave, saving }: {
  result: HealthAnalysisResult; onSave?: () => void; saving?: boolean
}) {
  const { compositeScore, label, ratios, categoryScores, derivedValues: d, input } = result

  const derivedItems: { label: string; value: string; className?: string }[] = [
    { label: "EPS", value: `${idr(d.eps)}/lembar` },
    { label: "BVPS", value: `${idr(d.bvps)}/lembar` },
    { label: "Market Cap", value: `${idr(d.marketCap)} jt` },
    { label: "Enterprise Value", value: `${idr(d.enterpriseValue)} jt` },
    { label: "Justified PBV", value: d.justifiedPbv > 0 ? mult(d.justifiedPbv) : "N/A" },
    { label: "Harga Wajar", value: d.fairPrice > 0 ? idr(d.fairPrice) : "N/A" },
    {
      label: "Margin of Safety",
      value: d.justifiedPbv > 0 ? pct(d.marginOfSafety) : "N/A",
      className: d.marginOfSafety > 0 ? "text-emerald-600" : "text-red-600",
    },
    { label: "Payout Ratio", value: pct(d.payoutRatio) },
  ]

  return (
    <div className="space-y-4 w-full">
      <Card className="overflow-hidden w-full">
        <div className={`h-2 ${scoreBg(compositeScore)}`} />
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Skor Komposit</p>
              <div className="flex items-baseline gap-3">
                <span className={`text-5xl font-black tabular-nums ${scoreColor(compositeScore)}`}>
                  {compositeScore.toFixed(1)}
                </span>
                <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${getHealthLabelClass(compositeScore)}`}>
                  {label}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{input.stockCode}</p>
              <p className="text-xs text-muted-foreground">
                {input.period} · {HEALTH_SUBSECTOR_LABELS[input.subsector]}
              </p>
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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 w-full">
        {CATEGORY_ORDER.map((key) => {
          const { score, weight } = categoryScores[key]
          return (
            <Card key={key}>
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground mb-1">{HEALTH_CATEGORY_LABELS[key]}</p>
                <p className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score.toFixed(1)}</p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full ${scoreBg(score)}`} style={{ width: `${score}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{(weight * 100).toFixed(0)}% bobot</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="w-full">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nilai Turunan & Valuasi</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {derivedItems.map((it) => (
              <div key={it.label}>
                <p className="text-xs text-muted-foreground">{it.label}</p>
                <p className={`font-semibold tabular-nums ${it.className ?? ""}`}>{it.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardContent className="p-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-4 py-3 border-b">Detail Rasio</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/40 text-xs text-muted-foreground border-b">
                  <th className="px-3 py-2 text-left font-medium">Rasio</th>
                  <th className="px-3 py-2 text-right font-medium">Nilai</th>
                  <th className="px-3 py-2 text-left font-medium w-44">Skor</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ORDER.map((cat) => {
                  const keys = HEALTH_RATIO_SECTIONS[cat].filter((k) => ratios[k])
                  if (keys.length === 0) return null
                  return (
                    <Fragment key={cat}>
                      <tr className="bg-muted/20">
                        <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                          {HEALTH_CATEGORY_LABELS[cat]} ({(categoryScores[cat].weight * 100).toFixed(0)}%)
                        </td>
                      </tr>
                      {keys.map((k) => {
                        const meta = HEALTH_RATIO_META[k]
                        const r = ratios[k]
                        return (
                          <tr key={k} className="border-b last:border-0">
                            <td className="px-3 py-2 text-sm">
                              {meta?.label ?? k}
                              {meta?.note && <span className="ml-1 text-xs text-muted-foreground">({meta.note})</span>}
                            </td>
                            <td className="px-3 py-2 text-sm text-right tabular-nums font-medium">
                              {meta?.format === "pct" ? pct(r.value) : mult(r.value)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className={`h-full rounded-full ${scoreBg(r.score)}`} style={{ width: `${r.score}%` }} />
                                </div>
                                <span className={`text-xs font-semibold tabular-nums w-8 text-right ${scoreColor(r.score)}`}>
                                  {r.score.toFixed(0)}
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
