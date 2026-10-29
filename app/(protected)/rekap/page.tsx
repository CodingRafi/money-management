import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Plus } from "lucide-react"
import Link from "next/link"
import { RekapTabs, type YearChartEntry } from "./_components/rekap-tabs"
import { YearNavigator } from "./_components/year-navigator"

type YearRow = {
  year: number
  total_income: number
  total_expense: number
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(amount)
}

export default async function RekapPage() {
  const userId = LOCAL_USER_ID

  const incomeRows = await db.prepare<[string], { year: number; total: number }>(
    "SELECT year, COALESCE(SUM(amount), 0) AS total FROM incomes WHERE user_id = ? GROUP BY year"
  ).all(userId) as { year: number; total: number }[]

  const expenseRows = await db.prepare<[string], { year: number; total: number }>(
    "SELECT year, COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id = ? GROUP BY year"
  ).all(userId) as { year: number; total: number }[]

  // Merge into year map
  const yearMap = new Map<number, { total_income: number; total_expense: number }>()
  for (const r of incomeRows) {
    yearMap.set(r.year, { total_income: r.total, total_expense: 0 })
  }
  for (const r of expenseRows) {
    const existing = yearMap.get(r.year) ?? { total_income: 0, total_expense: 0 }
    yearMap.set(r.year, { ...existing, total_expense: r.total })
  }

  const yearRows: YearRow[] = Array.from(yearMap.entries())
    .map(([year, v]) => ({ year, ...v }))
    .sort((a, b) => a.year - b.year)

  const currentYear    = new Date().getFullYear()
  const hasCurrentYear = yearRows.some((r) => r.year === currentYear)

  const sortedAsc = [...yearRows].sort((a, b) => a.year - b.year)
  const chartData: YearChartEntry[] = sortedAsc.map((row, i) => {
    const prev        = i > 0 ? sortedAsc[i - 1] : null
    const income      = row.total_income
    const expense     = row.total_expense
    const prevIncome  = prev?.total_income ?? null
    const prevExpense = prev?.total_expense ?? null
    return {
      year: row.year,
      income,
      expense,
      income_growth_nominal:  prevIncome  !== null ? income  - prevIncome  : null,
      income_growth_pct:      prevIncome  !== null && prevIncome  > 0 ? parseFloat((((income  - prevIncome)  / prevIncome)  * 100).toFixed(1)) : null,
      expense_growth_nominal: prevExpense !== null ? expense - prevExpense : null,
      expense_growth_pct:     prevExpense !== null && prevExpense > 0 ? parseFloat((((expense - prevExpense) / prevExpense) * 100).toFixed(1)) : null,
    }
  })

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cashflow</h1>
      </div>

      <RekapTabs chartData={chartData}>
        <div className="space-y-3">
          {yearRows.map((row) => {
            const balance = row.total_income - row.total_expense
            return (
              <Link
                key={row.year}
                href={`/rekap/${row.year}`}
                className="flex flex-col rounded-xl border px-5 py-4 hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm font-medium">Cashflow {row.year}</span>
                <div className="flex gap-4 mt-1.5 text-xs">
                  <span className="text-emerald-600">↑ {formatRupiah(row.total_income)}</span>
                  <span className="text-red-600">↓ {formatRupiah(row.total_expense)}</span>
                  <span className={balance >= 0 ? "text-blue-600" : "text-red-600"}>
                    = {formatRupiah(balance)}
                  </span>
                </div>
              </Link>
            )
          })}

          {!hasCurrentYear && (
            <Link
              href={`/rekap/${currentYear}`}
              className="flex items-center gap-2 rounded-xl border border-dashed px-5 py-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              Cashflow {currentYear}
            </Link>
          )}

          <div className="pt-1">
            <p className="text-xs text-muted-foreground mb-2">Tambah tahun</p>
            <YearNavigator />
          </div>
        </div>
      </RekapTabs>
    </div>
  )
}
