import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { ensureYearlyCategories } from "@/lib/ensureYearlyCategories"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react"
import Link from "next/link"
import { IncomeForm } from "./_components/income-form"
import { ExpenseForm } from "./_components/expense-form"
import { LoanGivenForm } from "./_components/loan-given-form"
import { LoanTakenForm } from "./_components/loan-taken-form"
import { ReportTab } from "./_components/report-tab"
import {
  addIncome, deleteIncome, updateIncome,
  addExpense, deleteExpense, updateExpense,
  addLoanGiven, deleteLoanGiven, updateLoanGiven,
  addLoanTaken, deleteLoanTaken, updateLoanTaken,
} from "@/app/actions/transactions"

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

const TABS = [
  { key: "pendapatan",  label: "Pendapatan" },
  { key: "pengeluaran", label: "Pengeluaran" },
  { key: "dipinjam",    label: "Dipinjam" },
  { key: "hutang",      label: "Hutang" },
]

function formatRupiah(amount: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(amount))
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

type ExpenseBdCat = {
  cat_id: string
  cat_name: string
  type_name: string
  type_sort: number
  cat_sort: number
  percentage: number
  months: Record<string, number>
}

type YearlyRecapRow = {
  total_income: string
  total_expense: string
  balance: string
  income_monthly: Record<string, number>
  expense_breakdown: ExpenseBdCat[]
}

function expenseStatus(pct: number, max: number, spent: number): "DANGER" | "WARNING" | "NORMAL" {
  if (pct <= 0 || max <= 0) return "NORMAL"
  const sisa = max - spent
  if (sisa < 0) return "DANGER"
  if (sisa < max * 0.2) return "WARNING"
  return "NORMAL"
}

type IncomeRow = {
  id: string; date: string; name: string
  category_id: string | null; category_name: string | null
  wallet_id: string | null; wallet_name: string | null; amount: string
}
type ExpenseRow = {
  id: string; date: string; name: string
  wallet_id: string | null; wallet_name: string | null
  category_id: string | null; category_name: string | null
  needs_type: string; amount: string
}
type LoanGivenRow = { id: string; borrower: string; amount: string; status: string; notes: string | null }
type LoanTakenRow = { id: string; lender: string; amount: string; notes: string | null }

export default async function YearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const { year: yearStr } = await params
  const year = parseInt(yearStr)
  if (isNaN(year)) redirect("/rekap")

  // Auto-create current year's categories if needed (no-op for past years)
  if (year === new Date().getFullYear()) {
    await ensureYearlyCategories(userId, year)
  }

  const sp = await searchParams

  const view     = sp.view === "report" ? "report" : "manage"
  const detail   = sp.detail === "pendapatan" ? "pendapatan"
                 : sp.detail === "pengeluaran" ? "pengeluaran"
                 : null
  const rawMonth = typeof sp.bulan === "string" ? parseInt(sp.bulan) : new Date().getMonth() + 1
  const month    = Math.max(1, Math.min(12, isNaN(rawMonth) ? 1 : rawMonth))
  const tab        = ["pendapatan", "pengeluaran", "dipinjam", "hutang"].includes(sp.tab as string)
    ? (sp.tab as string)
    : "pendapatan"
  const showNew    = sp.new === "1"
  const editId     = typeof sp.edit === "string" ? sp.edit : null
  const showReport = sp.report === "1" && tab === "pengeluaran"

  // Reference data for forms + yearly recap
  // For categories, use the best available year: exact match, else nearest year before, else any year
  const [incomeCatsRes, expenseCatsRes, walletsRes, yearlyRecapRes] = await Promise.all([
    pool.query<{ id: string; name: string }>(
      `WITH best_year AS (
         SELECT COALESCE(
           (SELECT MAX(year) FROM income_categories WHERE user_id = $1 AND year = $2),
           (SELECT MAX(year) FROM income_categories WHERE user_id = $1 AND year < $2),
           (SELECT MAX(year) FROM income_categories WHERE user_id = $1)
         ) AS y
       )
       SELECT id, name FROM income_categories, best_year
       WHERE user_id = $1 AND is_hidden = false AND year = best_year.y
       ORDER BY sort_order`,
      [userId, year],
    ),
    pool.query<{ id: string; name: string; type_name: string; default_percentage: number }>(
      `WITH best_year AS (
         SELECT COALESCE(
           (SELECT MAX(ec2.year) FROM expense_categories ec2 WHERE ec2.user_id = $1 AND ec2.year = $2),
           (SELECT MAX(ec2.year) FROM expense_categories ec2 WHERE ec2.user_id = $1 AND ec2.year < $2),
           (SELECT MAX(ec2.year) FROM expense_categories ec2 WHERE ec2.user_id = $1)
         ) AS y
       )
       SELECT ec.id, ec.name, et.name AS type_name,
              ec.default_percentage::float AS default_percentage
       FROM expense_categories ec
       JOIN expense_types et ON et.id = ec.type_id, best_year
       WHERE ec.user_id = $1 AND ec.is_hidden = false AND ec.year = best_year.y
       ORDER BY et.sort_order, ec.sort_order`,
      [userId, year],
    ),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets
       WHERE user_id = $1 AND is_active = true
       ORDER BY sort_order`,
      [userId],
    ),
    pool.query<YearlyRecapRow>(
      `SELECT total_income::text, total_expense::text, balance::text,
              COALESCE(income_monthly, '{}') AS income_monthly,
              COALESCE(expense_breakdown, '[]') AS expense_breakdown
       FROM yearly_recap WHERE user_id = $1 AND year = $2`,
      [userId, year],
    ),
  ])

  // Month-specific data (all tabs fetched in parallel)
  const [incomesRes, expensesRes, loansGivenRes, loansTakenRes] = await Promise.all([
    pool.query<IncomeRow>(
      `SELECT i.id, i.date::text, i.name,
              i.category_id, ic.name AS category_name,
              i.wallet_id,   w.name  AS wallet_name, i.amount::text
       FROM incomes i
       LEFT JOIN income_categories ic ON ic.id = i.category_id
       LEFT JOIN wallets w ON w.id = i.wallet_id
       WHERE i.user_id = $1 AND i.year = $2 AND i.month = $3
       ORDER BY i.date DESC, i.created_at DESC`,
      [userId, year, month],
    ),
    pool.query<ExpenseRow>(
      `SELECT e.id, e.date::text, e.name,
              e.wallet_id,   w.name  AS wallet_name,
              e.category_id, ec.name AS category_name,
              e.needs_type, e.amount::text
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       LEFT JOIN wallets w ON w.id = e.wallet_id
       WHERE e.user_id = $1 AND e.year = $2 AND e.month = $3
       ORDER BY e.date DESC, e.created_at DESC`,
      [userId, year, month],
    ),
    pool.query<LoanGivenRow>(
      `SELECT id, borrower, amount::text, status, notes
       FROM loans_given
       WHERE user_id = $1 AND year = $2 AND month = $3
       ORDER BY created_at DESC`,
      [userId, year, month],
    ),
    pool.query<LoanTakenRow>(
      `SELECT id, lender, amount::text, notes
       FROM loans_taken
       WHERE user_id = $1 AND year = $2 AND month = $3
       ORDER BY created_at DESC`,
      [userId, year, month],
    ),
  ])

  // Chart data for Report tab
  const [needsChartRes, catChartRes] = await Promise.all([
    pool.query<{ label: string; total: string }>(
      `SELECT needs_type AS label, SUM(amount)::text AS total
       FROM expenses
       WHERE user_id = $1 AND year = $2 AND month = $3
       GROUP BY needs_type
       ORDER BY needs_type`,
      [userId, year, month],
    ),
    pool.query<{ label: string; total: string }>(
      `SELECT COALESCE(ec.name, 'Lainnya') AS label, SUM(e.amount)::text AS total
       FROM expenses e
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE e.user_id = $1 AND e.year = $2 AND e.month = $3
       GROUP BY ec.name
       ORDER BY SUM(e.amount) DESC`,
      [userId, year, month],
    ),
  ])

  // Income breakdown by category × month (only when report detail is open)
  type IncomeBdRow = { category_name: string; month: number; total: string }
  const incomeBdRes = (view === "report" && detail === "pendapatan")
    ? await pool.query<IncomeBdRow>(
        `WITH best_year AS (
           SELECT COALESCE(
             (SELECT MAX(year) FROM income_categories WHERE user_id = $1 AND year = $2),
             (SELECT MAX(year) FROM income_categories WHERE user_id = $1 AND year < $2),
             (SELECT MAX(year) FROM income_categories WHERE user_id = $1)
           ) AS y
         )
         SELECT
           ic.name AS category_name,
           m.month,
           COALESCE(SUM(i.amount), 0)::text AS total
         FROM income_categories ic
         CROSS JOIN best_year
         CROSS JOIN generate_series(1, 12) AS m(month)
         LEFT JOIN incomes i ON i.category_id = ic.id
           AND i.month = m.month
           AND i.year  = $2
           AND i.user_id = $1
         WHERE ic.user_id = $1 AND ic.is_hidden = false AND ic.year = best_year.y
         GROUP BY ic.name, ic.sort_order, m.month
         ORDER BY ic.sort_order, ic.name, m.month`,
        [userId, year],
      )
    : { rows: [] as IncomeBdRow[] }

  // Budget % per category per month (from budgets table — the real source of user-set percentages)
  type BudgetRow = { cat_id: string; month: number; pct: number }
  const budgetRes = (view === "report" && detail === "pengeluaran")
    ? await pool.query<BudgetRow>(
        `SELECT category_id::text AS cat_id, month, percentage::float AS pct
         FROM budgets WHERE user_id = $1 AND year = $2`,
        [userId, year],
      )
    : { rows: [] as BudgetRow[] }

  const incomeCats  = incomeCatsRes.rows
  const expenseCats = expenseCatsRes.rows
  const wallets     = walletsRes.rows
  const incomes     = incomesRes.rows
  const expenses    = expensesRes.rows
  const loansGiven  = loansGivenRes.rows
  const loansTaken  = loansTakenRes.rows
  const yearlyRecap = yearlyRecapRes.rows[0] ?? null

  const bdMonths = [1,2,3,4,5,6,7,8,9,10,11,12]

  // Build income pivot: category → month → amount
  const bdCategoryOrder: string[] = []
  const bdCatMonthMap = new Map<string, Map<number, number>>()
  for (const row of incomeBdRes.rows) {
    if (!bdCatMonthMap.has(row.category_name)) {
      bdCategoryOrder.push(row.category_name)
      bdCatMonthMap.set(row.category_name, new Map())
    }
    bdCatMonthMap.get(row.category_name)!.set(row.month, parseFloat(row.total))
  }
  const bdMonthTotals = bdMonths.map((m) =>
    bdCategoryOrder.reduce((s, cat) => s + (bdCatMonthMap.get(cat)?.get(m) ?? 0), 0)
  )
  const bdGrandTotal = bdMonthTotals.reduce((s, t) => s + t, 0)

  // Expense breakdown: spending from JSONB, percentages always fresh from DB
  const incomeMo  = yearlyRecap?.income_monthly ?? {}
  const expBdSpendMap = new Map<string, Record<string, number>>()
  for (const cat of (yearlyRecap?.expense_breakdown ?? [])) {
    expBdSpendMap.set(cat.cat_id, cat.months)
  }

  type FreshExpCat = { id: string; name: string; type_name: string; default_percentage: number; months: Record<string, number> }
  type ExpenseGroup = { typeName: string; cats: FreshExpCat[] }
  const expGroups: ExpenseGroup[] = []
  for (const cat of expenseCats) {
    const last = expGroups[expGroups.length - 1]
    const enriched: FreshExpCat = { ...cat, months: expBdSpendMap.get(cat.id) ?? {} }
    if (!last || last.typeName !== cat.type_name) expGroups.push({ typeName: cat.type_name, cats: [enriched] })
    else last.cats.push(enriched)
  }
  const allExpCats  = expGroups.flatMap((g) => g.cats)
  const expMonthSpent = bdMonths.map((m) => allExpCats.reduce((s, c) => s + (c.months[String(m)] ?? 0), 0))

  // Budget map: cat_id → month → user-set percentage
  const budgetMap = new Map<string, Map<number, number>>()
  for (const row of budgetRes.rows) {
    if (!budgetMap.has(row.cat_id)) budgetMap.set(row.cat_id, new Map())
    budgetMap.get(row.cat_id)!.set(row.month, row.pct)
  }
  const catRepPct   = (id: string) => Math.max(0, ...Array.from(budgetMap.get(id)?.values() ?? [0]))
  // For each month: use that month's budget if set, otherwise fall back to the representative %
  const getMonthPct = (id: string, m: number) => budgetMap.get(id)?.get(m) ?? catRepPct(id)
  const expTotalPct = allExpCats.reduce((s, c) => s + catRepPct(c.id), 0)

  // Ensure all 3 needs_types always appear in chart
  const needsMap   = new Map(needsChartRes.rows.map((r) => [r.label, parseFloat(r.total)]))
  const needsChart = (["PRIMER", "SEKUNDER", "TERSIER"] as const).map((k) => ({
    label: k,
    total: needsMap.get(k) ?? 0,
  }))
  const catChart = catChartRes.rows.map((r) => ({ label: r.label, total: parseFloat(r.total) }))

  const base        = `/rekap/${year}`
  const cancelHref  = `${base}?bulan=${month}&tab=${tab}`
  const tambahHref = `${cancelHref}&new=1`

  const tabLabel: Record<string, string> = {
    pendapatan: "Pendapatan", pengeluaran: "Pengeluaran",
    dipinjam: "Pinjaman", hutang: "Hutang",
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href="/rekap">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Rekap {year}</h1>
          <p className="text-sm text-muted-foreground">Detail keuangan per bulan</p>
        </div>
      </div>

      {/* Top menu */}
      <div className="flex gap-1 border-b pb-0">
        <Link
          href={`${base}?bulan=${month}&tab=${tab}`}
          className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            view === "manage"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Manage Keuangan
        </Link>
        <Link
          href={`${base}?view=report`}
          className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            view === "report"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Report
        </Link>
      </div>

      {/* ── Report view ── */}
      {view === "report" && (
        <div className="space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Link
              href={detail === "pendapatan" ? `${base}?view=report` : `${base}?view=report&detail=pendapatan`}
              className="block"
            >
              <Card className={`transition-all hover:shadow-md cursor-pointer ${detail === "pendapatan" ? "ring-2 ring-emerald-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">Total Pendapatan</p>
                  <p className="text-lg font-bold text-emerald-600">
                    {formatRupiah(yearlyRecap?.total_income ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {detail === "pendapatan" ? "▲ Tutup detail" : "▼ Lihat detail"}
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link
              href={detail === "pengeluaran" ? `${base}?view=report` : `${base}?view=report&detail=pengeluaran`}
              className="block"
            >
              <Card className={`transition-all hover:shadow-md cursor-pointer ${detail === "pengeluaran" ? "ring-2 ring-rose-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">Total Pengeluaran</p>
                  <p className="text-lg font-bold text-red-600">
                    {formatRupiah(yearlyRecap?.total_expense ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {detail === "pengeluaran" ? "▲ Tutup detail" : "▼ Lihat detail"}
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Sisa</p>
                <p className={`text-lg font-bold ${
                  Number(yearlyRecap?.balance ?? 0) >= 0 ? "text-blue-600" : "text-red-600"
                }`}>
                  {formatRupiah(yearlyRecap?.balance ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {!yearlyRecap && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Belum ada data pendapatan atau pengeluaran untuk tahun {year}.
            </p>
          )}

          {/* Income breakdown table */}
          {/* Expense breakdown table */}
          {detail === "pengeluaran" && expGroups.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="text-xs whitespace-nowrap border-collapse">
                    <thead>
                      <tr className="bg-rose-600 text-white">
                        <th rowSpan={2} className="w-[100px] px-3 py-2.5 text-center font-semibold sticky left-0 bg-rose-600 z-20 border-r border-rose-500">TYPE</th>
                        <th rowSpan={2} className="w-[150px] px-3 py-2.5 text-left font-semibold sticky left-[80px] bg-rose-600 z-20 border-r border-rose-500">NAMA</th>
                        <th rowSpan={2} className="min-w-[72px] max-w-[72px] px-3 py-2.5 text-right font-semibold sticky left-[230px] bg-rose-600 z-20 border-r border-rose-500">%</th>
                        {MONTHS.map((m) => (
                          <th key={m} colSpan={4} className="px-3 py-2.5 text-center font-semibold border-l border-rose-500">
                            {m.toUpperCase()}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-rose-700 text-white">
                        {bdMonths.map((m) => (
                          [
                            <th key={`${m}-max`}  className="px-2 py-2 text-right min-w-[110px] border-l border-rose-600">MAX</th>,
                            <th key={`${m}-out`}  className="px-2 py-2 text-right min-w-[110px]">PENGELUARAN</th>,
                            <th key={`${m}-sisa`} className="px-2 py-2 text-right min-w-[100px]">SISA</th>,
                            <th key={`${m}-sts`}  className="px-2 py-2 text-center min-w-[72px]">STATUS</th>,
                          ]
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {expGroups.map(({ typeName, cats }, gi) =>
                        cats.map((cat, ci) => {
                          const isLastInGroup = ci === cats.length - 1
                          const repPct = catRepPct(cat.id)
                          return (
                            <tr
                              key={cat.id}
                              className={`${isLastInGroup ? "border-b-2 border-border" : "border-b border-border/40"} ${ci % 2 === 0 ? "bg-muted/30" : ""}`}
                            >
                              {/* TYPE — rendered every row, text only on first */}
                              <td className={`w-[100px] px-3 py-2.5 text-center font-semibold sticky left-0 z-10 border-r border-border bg-background ${ci === 0 ? "align-top pt-3" : ""}`}>
                                {ci === 0 ? typeName : ""}
                              </td>
                              <td className="w-[150px] px-3 py-2.5 font-medium sticky left-[80px] z-10 border-r border-border bg-background">
                                {cat.name}
                              </td>
                              <td className="min-w-[72px] max-w-[72px] px-3 py-2.5 text-right tabular-nums sticky left-[230px] z-10 bg-background border-r border-border text-muted-foreground">
                                {repPct > 0 ? `${repPct.toFixed(2)}%` : "—"}
                              </td>
                              {bdMonths.map((m) => {
                                const monthPct    = getMonthPct(cat.id, m)
                                const monthIncome = Number(incomeMo[String(m)] ?? 0)
                                const maxBudget   = monthIncome * (monthPct / 100)
                                const spent       = cat.months[String(m)] ?? 0
                                const sisa        = maxBudget - spent
                                const status      = expenseStatus(monthPct, maxBudget, spent)
                                const statusCls   = status === "DANGER" ? "bg-red-500 text-white" : status === "WARNING" ? "bg-amber-400 text-white" : "bg-emerald-500 text-white"
                                return [
                                  <td key={`${m}-max`}  className="px-2 py-2.5 text-right tabular-nums text-muted-foreground border-l border-border">
                                    {monthPct > 0 ? formatRupiah(maxBudget) : "—"}
                                  </td>,
                                  <td key={`${m}-out`}  className="px-2 py-2.5 text-right tabular-nums">
                                    {formatRupiah(spent)}
                                  </td>,
                                  <td key={`${m}-sisa`} className={`px-2 py-2.5 text-right tabular-nums ${sisa < 0 ? "text-red-600 font-medium" : ""}`}>
                                    {monthPct > 0 ? formatRupiah(sisa) : "—"}
                                  </td>,
                                  <td key={`${m}-sts`}  className="px-2 py-2.5 text-center border-r border-border/30">
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${statusCls}`}>{status}</span>
                                  </td>,
                                ]
                              })}
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-rose-700 text-white font-bold">
                        <td className="w-[100px] sticky left-0 bg-rose-700 z-10" />
                        <td className="w-[150px] sticky left-[100px] bg-rose-700 z-10" />
                        <td className="min-w-[72px] max-w-[72px] px-3 py-2.5 text-right sticky left-[250px] bg-rose-700 z-10 border-r border-rose-600">
                          TOTAL
                        </td>
                        {bdMonths.map((m) => {
                          const totalSpent = expMonthSpent[m - 1]
                          return [
                            <td key={`${m}-max`}  className="px-2 py-2.5 border-l border-rose-500" />,
                            <td key={`${m}-out`}  className="px-2 py-2.5 text-right tabular-nums">{formatRupiah(totalSpent)}</td>,
                            <td key={`${m}-sisa`} className="px-2 py-2.5" />,
                            <td key={`${m}-sts`}  className="px-2 py-2.5" />,
                          ]
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Income breakdown table */}
          {detail === "pendapatan" && bdCategoryOrder.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead>
                      <tr className="bg-emerald-600 text-white">
                        <th className="w-[140px] px-4 py-3 text-left font-semibold sticky left-0 bg-emerald-600 z-10">NAMA</th>
                        {MONTHS.map((m) => (
                          <th key={m} className="px-3 py-3 text-right font-semibold min-w-[110px]">
                            {m.toUpperCase()}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right font-semibold min-w-[120px]">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bdCategoryOrder.map((cat, ci) => {
                        const catTotal = bdMonths.reduce((s, m) => s + (bdCatMonthMap.get(cat)?.get(m) ?? 0), 0)
                        return (
                          <tr
                            key={cat}
                            className={`border-b ${ci % 2 === 0 ? "bg-muted/30" : ""}`}
                          >
                            <td className="w-[140px] px-4 py-2.5 font-medium sticky left-0 z-10 bg-background">
                              {cat}
                            </td>
                            {bdMonths.map((m) => {
                              const val = bdCatMonthMap.get(cat)?.get(m) ?? 0
                              return (
                                <td key={m} className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                  {formatRupiah(val)}
                                </td>
                              )
                            })}
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                              {formatRupiah(catTotal)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-700 text-white">
                        <td className="px-4 py-3 font-bold sticky left-0 bg-emerald-700 z-10">TOTAL</td>
                        {bdMonthTotals.map((t, i) => (
                          <td key={i} className="px-3 py-3 text-right tabular-nums font-bold">
                            {formatRupiah(t)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right tabular-nums font-bold">
                          {formatRupiah(bdGrandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Manage Keuangan view ── */}
      {view === "manage" && <div className="grid grid-cols-[176px_1fr] gap-5 items-start">
        {/* Month sidebar */}
        <Card>
          <CardContent className="p-1.5">
            {MONTHS.map((name, i) => {
              const m = i + 1
              const active = m === month
              return (
                <Link
                  key={m}
                  href={`${base}?bulan=${m}&tab=${tab}`}
                  className={`flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {name}
                </Link>
              )
            })}
          </CardContent>
        </Card>

        {/* Content */}
        <div className="space-y-4 min-w-0">
          {/* Month header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{MONTHS[month - 1]} {year}</h2>
            {!showNew && !showReport && !editId && (
              <Button asChild size="sm">
                <Link href={tambahHref}>
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah {tabLabel[tab]}
                </Link>
              </Button>
            )}
          </div>

          {/* Tab navigation */}
          <div className="flex gap-0 border-b">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={`${base}?bulan=${month}&tab=${t.key}`}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* Add form */}
          {showNew && !showReport && !editId && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Tambah {tabLabel[tab]}</p>
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                    <Link href={cancelHref}>Batal</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {tab === "pendapatan" && (
                  <IncomeForm action={addIncome} year={year} month={month} categories={incomeCats} wallets={wallets} />
                )}
                {tab === "pengeluaran" && (
                  <ExpenseForm action={addExpense} year={year} month={month} categories={expenseCats} wallets={wallets} />
                )}
                {tab === "dipinjam" && (
                  <LoanGivenForm action={addLoanGiven} year={year} month={month} />
                )}
                {tab === "hutang" && (
                  <LoanTakenForm action={addLoanTaken} year={year} month={month} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Edit form */}
          {editId && !showReport && (() => {
            const incomeRow   = tab === "pendapatan"  ? incomes.find(r => r.id === editId)    : null
            const expenseRow  = tab === "pengeluaran" ? expenses.find(r => r.id === editId)   : null
            const loanGivRow  = tab === "dipinjam"    ? loansGiven.find(r => r.id === editId) : null
            const loanTakRow  = tab === "hutang"      ? loansTaken.find(r => r.id === editId) : null
            const found = incomeRow ?? expenseRow ?? loanGivRow ?? loanTakRow
            if (!found) return null
            return (
              <Card className="border-primary/40">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Edit {tabLabel[tab]}</p>
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                      <Link href={cancelHref}>Batal</Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  {incomeRow && (
                    <IncomeForm
                      action={updateIncome.bind(null, editId)}
                      year={year} month={month}
                      categories={incomeCats} wallets={wallets}
                      defaultValues={{
                        date: incomeRow.date, name: incomeRow.name,
                        categoryId: incomeRow.category_id, walletId: incomeRow.wallet_id,
                        amount: parseFloat(incomeRow.amount),
                      }}
                      submitLabel="Simpan Perubahan"
                    />
                  )}
                  {expenseRow && (
                    <ExpenseForm
                      action={updateExpense.bind(null, editId)}
                      year={year} month={month}
                      categories={expenseCats} wallets={wallets}
                      defaultValues={{
                        date: expenseRow.date, name: expenseRow.name,
                        walletId: expenseRow.wallet_id, categoryId: expenseRow.category_id,
                        needsType: expenseRow.needs_type, amount: parseFloat(expenseRow.amount),
                      }}
                      submitLabel="Simpan Perubahan"
                    />
                  )}
                  {loanGivRow && (
                    <LoanGivenForm
                      action={updateLoanGiven.bind(null, editId)}
                      year={year} month={month}
                      defaultValues={{
                        borrower: loanGivRow.borrower, amount: parseFloat(loanGivRow.amount),
                        status: loanGivRow.status, notes: loanGivRow.notes,
                      }}
                      submitLabel="Simpan Perubahan"
                    />
                  )}
                  {loanTakRow && (
                    <LoanTakenForm
                      action={updateLoanTaken.bind(null, editId)}
                      year={year} month={month}
                      defaultValues={{
                        lender: loanTakRow.lender, amount: parseFloat(loanTakRow.amount),
                        notes: loanTakRow.notes,
                      }}
                      submitLabel="Simpan Perubahan"
                    />
                  )}
                </CardContent>
              </Card>
            )
          })()}

          {/* ── Pendapatan tab ── */}
          {tab === "pendapatan" && (
            <Card>
              <CardContent className="p-0">
                {incomes.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada data pendapatan bulan ini.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                          <th className="px-4 py-3 text-left font-medium">Nama / Keterangan</th>
                          <th className="px-4 py-3 text-left font-medium">Kategori</th>
                          <th className="px-4 py-3 text-left font-medium">Wallet</th>
                          <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {incomes.map((row) => (
                          <tr key={row.id} className={`border-b transition-colors ${editId === row.id ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                            <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                              {formatDate(row.date)}
                            </td>
                            <td className="px-4 py-3 font-medium">{row.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.category_name ?? "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{row.wallet_name ?? "—"}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">
                              {formatRupiah(row.amount)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                  <Link href={`${base}?bulan=${month}&tab=pendapatan&edit=${row.id}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <form action={deleteIncome.bind(null, row.id, yearStr, String(month))}>
                                  <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20">
                          <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                            Total
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600">
                            {formatRupiah(incomes.reduce((s, r) => s + parseFloat(r.amount), 0))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Pengeluaran tab ── */}
          {tab === "pengeluaran" && (
            <>
              {/* Toggle: Report Pengeluaran */}
              <div className="flex justify-start">
                <Link
                  href={
                    showReport
                      ? `${base}?bulan=${month}&tab=pengeluaran`
                      : `${base}?bulan=${month}&tab=pengeluaran&report=1`
                  }
                  className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                    showReport
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground border-border"
                  }`}
                >
                  Report Pengeluaran
                </Link>
              </div>

              {/* Report view */}
              {showReport ? (
                <ReportTab needsData={needsChart} categoryData={catChart} />
              ) : (
                <Card>
                  <CardContent className="p-0">
                    {expenses.length === 0 ? (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        Belum ada data pengeluaran bulan ini.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground">
                              <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                              <th className="px-4 py-3 text-left font-medium">Nama / Keterangan</th>
                              <th className="px-4 py-3 text-left font-medium">Wallet</th>
                              <th className="px-4 py-3 text-left font-medium">Kategori</th>
                              <th className="px-4 py-3 text-left font-medium">Kebutuhan</th>
                              <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody>
                            {expenses.map((row) => (
                              <tr key={row.id} className={`border-b transition-colors ${editId === row.id ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                                <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                                  {formatDate(row.date)}
                                </td>
                                <td className="px-4 py-3 font-medium">{row.name}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.wallet_name ?? "—"}</td>
                                <td className="px-4 py-3 text-muted-foreground">{row.category_name ?? "—"}</td>
                                <td className="px-4 py-3">
                                  <Badge
                                    variant={
                                      row.needs_type === "PRIMER"   ? "default"   :
                                      row.needs_type === "SEKUNDER" ? "secondary" : "outline"
                                    }
                                    className="text-xs"
                                  >
                                    {row.needs_type}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">
                                  {formatRupiah(row.amount)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-0.5">
                                    <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                      <Link href={`${base}?bulan=${month}&tab=pengeluaran&edit=${row.id}`}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Link>
                                    </Button>
                                    <form action={deleteExpense.bind(null, row.id, yearStr, String(month))}>
                                      <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </form>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-muted/20">
                              <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                                Total
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">
                                {formatRupiah(expenses.reduce((s, r) => s + parseFloat(r.amount), 0))}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── Dipinjam tab ── */}
          {tab === "dipinjam" && (
            <Card>
              <CardContent className="p-0">
                {loansGiven.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada data pinjaman bulan ini.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">Nama Peminjam</th>
                          <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Keterangan</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {loansGiven.map((row) => (
                          <tr key={row.id} className={`border-b transition-colors ${editId === row.id ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                            <td className="px-4 py-3 font-medium">{row.borrower}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">
                              {formatRupiah(row.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={row.status === "FIX" ? "success" : "warning"} className="text-xs">
                                {row.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.notes ?? "—"}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                  <Link href={`${base}?bulan=${month}&tab=dipinjam&edit=${row.id}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <form action={deleteLoanGiven.bind(null, row.id, yearStr, String(month))}>
                                  <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20">
                          <td className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">
                            {formatRupiah(loansGiven.reduce((s, r) => s + parseFloat(r.amount), 0))}
                          </td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Hutang tab ── */}
          {tab === "hutang" && (
            <Card>
              <CardContent className="p-0">
                {loansTaken.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada data hutang bulan ini.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-muted-foreground">
                          <th className="px-4 py-3 text-left font-medium">Nama Pemberi Hutang</th>
                          <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                          <th className="px-4 py-3 text-left font-medium">Keterangan</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {loansTaken.map((row) => (
                          <tr key={row.id} className={`border-b transition-colors ${editId === row.id ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                            <td className="px-4 py-3 font-medium">{row.lender}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-medium">
                              {formatRupiah(row.amount)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{row.notes ?? "—"}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                  <Link href={`${base}?bulan=${month}&tab=hutang&edit=${row.id}`}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                <form action={deleteLoanTaken.bind(null, row.id, yearStr, String(month))}>
                                  <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </form>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20">
                          <td className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">
                            {formatRupiah(loansTaken.reduce((s, r) => s + parseFloat(r.amount), 0))}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </div>}

    </div>
  )
}
