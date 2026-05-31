import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Plus } from "lucide-react"
import Link from "next/link"
import { RekapTabs, type YearChartEntry } from "./_components/rekap-tabs"

type YearRow = {
  year: number
  total_income: string
  total_expense: string
  balance: string
}

function formatRupiah(amount: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(amount))
}

export default async function RekapPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const { rows: yearRows } = await pool.query<YearRow>(
    `SELECT year, total_income::text, total_expense::text, balance::text
     FROM yearly_recap
     WHERE user_id = $1
     ORDER BY year DESC`,
    [userId],
  )

  const currentYear = new Date().getFullYear()
  const hasCurrentYear = yearRows.some((r) => r.year === currentYear)

  // Compute YoY growth (sorted ASC for sequential comparison)
  const sortedAsc = [...yearRows].sort((a, b) => a.year - b.year)
  const chartData: YearChartEntry[] = sortedAsc.map((row, i) => {
    const prev = i > 0 ? sortedAsc[i - 1] : null
    const income = parseFloat(row.total_income)
    const expense = parseFloat(row.total_expense)
    const prevIncome = prev ? parseFloat(prev.total_income) : null
    const prevExpense = prev ? parseFloat(prev.total_expense) : null
    return {
      year: row.year,
      income,
      expense,
      income_growth_nominal: prevIncome !== null ? income - prevIncome : null,
      income_growth_pct:
        prevIncome !== null && prevIncome > 0
          ? parseFloat((((income - prevIncome) / prevIncome) * 100).toFixed(1))
          : null,
      expense_growth_nominal: prevExpense !== null ? expense - prevExpense : null,
      expense_growth_pct:
        prevExpense !== null && prevExpense > 0
          ? parseFloat((((expense - prevExpense) / prevExpense) * 100).toFixed(1))
          : null,
    }
  })

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Cashflow</h1>
      </div>

      <RekapTabs chartData={chartData}>
        {/* Year list */}
        <div className="space-y-3">
          {yearRows.map((row) => {
            const balance = parseFloat(row.balance)
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
                    = {formatRupiah(row.balance)}
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
        </div>
      </RekapTabs>
    </div>
  )
}
