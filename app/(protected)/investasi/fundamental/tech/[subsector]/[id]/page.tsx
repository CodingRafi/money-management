import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Trash2 } from "lucide-react"
import Link from "next/link"
import { TechResult } from "../../../_components/tech-result"
import { deleteAnalysis } from "@/app/actions/fundamental"
import type { TechAnalysisResult, TechSubsector } from "@/lib/fundamental/tech-types"
import { TECH_SUBSECTOR_LABELS } from "@/lib/fundamental/tech-types"

type Row = { id: string; sector: string; stock_code: string; period: string; result_data: string; created_at: string }

const VALID: TechSubsector[] = ['general', 'saas', 'ecommerce']

export default async function SavedTechAnalysisPage({
  params,
}: {
  params: Promise<{ subsector: string; id: string }>
}) {
  const { subsector, id } = await params
  if (!VALID.includes(subsector as TechSubsector)) redirect("/investasi/fundamental/tech")

  const userId = LOCAL_USER_ID
  const sector = `TECH_${subsector.toUpperCase()}`

  const row = await db.prepare<[string, string, string], Row>(
    "SELECT id, sector, stock_code, period, result_data, created_at FROM fundamental_analyses WHERE id = ? AND user_id = ? AND sector = ?"
  ).get(id, userId, sector) as Row | undefined

  if (!row) redirect("/investasi/fundamental")

  const result = JSON.parse(row.result_data) as TechAnalysisResult

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
              {TECH_SUBSECTOR_LABELS[subsector as TechSubsector]} ·{" "}
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

      <TechResult result={result} />
    </div>
  )
}
