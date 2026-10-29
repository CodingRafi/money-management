import { expenseService } from "@/services/expense.service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StackedSpendingChart } from "./StackedSpendingChart"

/** Komposisi pengeluaran Rumah Tangga vs Personal per anggota (Mode Laporan Keluarga). */
export async function FamilySpendingSection({
  members,
  year,
  month,
}: {
  members: { user_id: string; name: string }[]
  year: number
  month: number
}) {
  const split = await expenseService.spendingSplit(members.map((m) => m.user_id), year, month)
  const byUser = new Map(split.map((r) => [r.user_id, r]))
  const data = members.map((m) => ({
    name: m.name,
    personal: byUser.get(m.user_id)?.personal ?? 0,
    household: byUser.get(m.user_id)?.household ?? 0,
  }))
  const hasData = data.some((d) => d.personal > 0 || d.household > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Komposisi Pengeluaran per Anggota</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <StackedSpendingChart data={data} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada pengeluaran pada periode ini.</p>
        )}
      </CardContent>
    </Card>
  )
}
