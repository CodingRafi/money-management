import { requireSession } from "@/lib/session"
import { expenseService } from "@/services/expense.service"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

export default async function SayaPage() {
  const session = await requireSession()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const { spent, limit, remaining } = await expenseService.childSummary(session, year, month)
  const pct = limit && limit > 0 ? Math.min(100, (spent / limit) * 100) : 0

  return (
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Halo, {session.username}!</h1>
        <p className="text-sm text-muted-foreground">Jajan bulan ini</p>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Belanja vs Batas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold tabular-nums">{rp(spent)}</p>
          {limit != null ? (
            <>
              <div className="h-2 w-full overflow-hidden rounded bg-muted">
                <div className={`h-full ${pct >= 90 ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground">
                Batas {rp(limit)} · sisa {rp(remaining ?? 0)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Belum ada batas belanja yang ditetapkan.</p>
          )}
        </CardContent>
      </Card>
      <Button asChild variant="outline" size="sm"><Link href="/dashboard">Lihat Dashboard</Link></Button>
    </div>
  )
}
