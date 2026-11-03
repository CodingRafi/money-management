import Link from "next/link"
import { ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PERMISSION } from "@/lib/permissions"
import { requirePermission } from "@/lib/session"
import { requireScope } from "@/lib/scope"
import { riskService } from "@/services/risk.service"
import { Simulator } from "./_components/Simulator"
import { SyncAllButton } from "./_components/SyncAllButton"
import { parseUrlState, type WeightMap } from "./_components/presets"

export default async function SimulasiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission(PERMISSION.INVESTMENT.VIEW)
  const scope = await requireScope()
  const sp = await searchParams

  const [ctx, positions] = await Promise.all([
    riskService.simulationContext(scope.userIds),
    riskService.currentPositions(scope.userIds),
  ])
  const total = positions.reduce((s, p) => s + p.value, 0)
  const currentWeights: WeightMap = {}
  for (const p of positions) currentWeights[p.investmentId] = total > 0 ? (p.value / total) * 100 : 0

  const canSync = !scope.readOnly && scope.mode === "personal" && session.role !== "child"

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
            <Link href="/investasi"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Simulasi &amp; Risiko Portofolio</h1>
            <p className="text-sm text-muted-foreground">
              Uji alokasi dengan data historis, proyeksi Monte Carlo, dan stress test
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm"><Link href="/investasi/rekap"><RefreshCw className="h-4 w-4 mr-1.5" />Risiko aktual</Link></Button>
          {canSync && <SyncAllButton />}
        </div>
      </div>

      <Simulator
        assets={ctx.assets}
        benchmarks={ctx.benchmarks}
        currentWeights={currentWeights}
        withoutPrices={ctx.withoutPrices}
        initial={parseUrlState(sp)}
      />
    </div>
  )
}
