import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserId } from "@/lib/session"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Trash2 } from "lucide-react"
import Link from "next/link"
import { BankResult } from "../../_components/bank-result"
import { deleteAnalysis } from "@/app/actions/fundamental"
import type { BankAnalysisResult } from "@/lib/fundamental/types"

type Row = { id: string; stock_code: string; period: string; result_data: string; created_at: string }

export default async function SavedAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id }  = await params
  const userId  = await requireUserId()

  const row = await db.prepare<[string, string], Row>(
    "SELECT id, stock_code, period, result_data, created_at FROM fundamental_analyses WHERE id = ? AND user_id = ? AND sector = 'BANK'"
  ).get(id, userId) as Row | undefined

  if (!row) redirect("/investasi/fundamental")

  const result = JSON.parse(row.result_data) as BankAnalysisResult

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

      <BankResult result={result} />
    </div>
  )
}
