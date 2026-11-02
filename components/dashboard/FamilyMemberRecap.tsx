import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getMemberRecap } from "@/lib/dashboard"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

/** Rekap per anggota untuk satu bulan: pemasukan, pengeluaran, dan sisa. */
export async function FamilyMemberRecap({
  members,
  month,
  year,
}: {
  members: { user_id: string; name: string }[]
  month: number
  year: number
}) {
  const recap = await getMemberRecap(members.map((m) => m.user_id), month, year)
  const byUser = new Map(recap.map((r) => [r.userId, r]))

  const rows = members.map((m) => {
    const r = byUser.get(m.user_id)
    const income = r?.income ?? 0
    const expense = r?.expense ?? 0
    return { id: m.user_id, name: m.name, income, expense, remaining: income - expense }
  })
  const total = rows.reduce(
    (t, r) => ({ income: t.income + r.income, expense: t.expense + r.expense, remaining: t.remaining + r.remaining }),
    { income: 0, expense: 0, remaining: 0 },
  )

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Rekap per Anggota</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Anggota</th>
              <th className="px-3 py-2 text-right font-medium">Pemasukan</th>
              <th className="px-3 py-2 text-right font-medium">Pengeluaran</th>
              <th className="py-2 pl-3 text-right font-medium">Sisa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-right tabular-nums text-primary">{formatRp(r.income)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatRp(r.expense)}</td>
                <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${r.remaining < 0 ? "text-destructive" : ""}`}>
                  {formatRp(r.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="py-2 pr-3">Total Keluarga</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRp(total.income)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRp(total.expense)}</td>
              <td className={`py-2 pl-3 text-right tabular-nums ${total.remaining < 0 ? "text-destructive" : ""}`}>
                {formatRp(total.remaining)}
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  )
}

export function FamilyMemberRecapSkeleton() {
  return (
    <Card>
      <CardContent className="animate-pulse space-y-3 p-4">
        <div className="h-3 w-32 rounded bg-muted" />
        {[0, 1, 2].map((i) => <div key={i} className="h-4 w-full rounded bg-muted" />)}
      </CardContent>
    </Card>
  )
}
