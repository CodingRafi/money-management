import { db } from "@/lib/db"
import { requireScope } from "@/lib/scope"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { FiCalculator } from "./_components/fi-calculator"

export default async function KebebasanFinansialPage() {
  const scope  = await requireScope()
  const userId = scope.userIds

  const inv = await db.prepare<[string[]]>(
    `SELECT COALESCE(SUM(CASE WHEN it.type='BUY' THEN it.total_amount WHEN it.type='SELL' THEN -it.total_amount ELSE 0 END),0) AS modal_aktif
     FROM investment_transactions it JOIN investments i ON i.id = it.investment_id
     WHERE i.user_id = ANY(?) AND i.is_active = 1 AND i.is_closed = 0`
  ).get(userId) as { modal_aktif: number }

  // Rata-rata pengeluaran bulanan: 12 bulan terakhir, dibagi jumlah bulan yang punya data
  const exp = await db.prepare<[string[]]>(
    `SELECT COALESCE(SUM(amount),0) AS total, COUNT(DISTINCT (year * 100 + month)) AS months
     FROM expenses
     WHERE user_id = ANY(?) AND is_initial = 0
       AND (year * 12 + month) > (EXTRACT(YEAR FROM NOW())::int * 12 + EXTRACT(MONTH FROM NOW())::int - 12)`
  ).get(userId) as { total: number; months: number }

  const months = Number(exp?.months ?? 0)
  const avgExpense = months > 0 ? Math.round(Number(exp.total) / months) : 0

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
          <Link href="/investasi"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Kalkulator Kebebasan Finansial</h1>
          <p className="text-sm text-muted-foreground">
            Hitung dana yang dibutuhkan agar hasil investasi menutup pengeluaran bulananmu
          </p>
        </div>
      </div>

      <FiCalculator
        defaultExpense={avgExpense}
        defaultCurrent={Math.max(0, Math.round(Number(inv?.modal_aktif ?? 0)))}
        expenseMonths={months}
      />
    </div>
  )
}
