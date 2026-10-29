import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserId } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Trash2 } from "lucide-react"
import Link from "next/link"
import { EnergyResult } from "../../../_components/energy-result"
import { deleteAnalysis } from "@/app/actions/fundamental"
import type { EnergyAnalysisResult, EnergySubsector } from "@/lib/fundamental/energy-types"
import { ENERGY_SUBSECTOR_LABELS } from "@/lib/fundamental/energy-types"

type Row = { id: string; sector: string; stock_code: string; period: string; result_data: string; created_at: string }

const VALID: EnergySubsector[] = ['migas', 'batubara', 'ebt']

export default async function SavedEnergyAnalysisPage({
  params,
}: {
  params: Promise<{ subsector: string; id: string }>
}) {
  const { subsector, id } = await params
  if (!VALID.includes(subsector as EnergySubsector)) redirect("/investasi/fundamental/energy")

  const userId = await requireUserId()
  const sector = `ENERGY_${subsector.toUpperCase()}`

  const row = await db.prepare<[string, string, string], Row>(
    "SELECT id, sector, stock_code, period, result_data, created_at FROM fundamental_analyses WHERE id = ? AND user_id = ? AND sector = ?"
  ).get(id, userId, sector) as Row | undefined

  if (!row) redirect("/investasi/fundamental")

  const result = JSON.parse(row.result_data) as EnergyAnalysisResult

  async function handleDelete() {
    "use server"
    await deleteAnalysis(id)
    redirect("/investasi/fundamental")
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
            <Link href="/investasi/fundamental"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{row.stock_code} — {row.period}</h1>
            <p className="text-sm text-muted-foreground">
              {ENERGY_SUBSECTOR_LABELS[subsector as EnergySubsector]} ·{" "}
              Disimpan {new Date(row.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <form action={handleDelete}>
          <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/30 shrink-0">
            <Trash2 className="h-3.5 w-3.5 mr-1" />Hapus
          </Button>
        </form>
      </div>

      <EnergyResult result={result} />
    </div>
  )
}
