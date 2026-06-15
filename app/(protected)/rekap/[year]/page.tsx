import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
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
import { StatChart } from "./_components/stat-chart"
import { IncomeDetailTabs } from "./_components/income-detail-tabs"
import { ExpenseDetailTabs } from "./_components/expense-detail-tabs"
import { TransferForm } from "./_components/transfer-form"
import {
  addIncome, deleteIncome, updateIncome,
  addExpense, deleteExpense, updateExpense,
  addLoanGiven, deleteLoanGiven, updateLoanGiven,
  addLoanTaken, deleteLoanTaken, updateLoanTaken,
} from "@/app/actions/transactions"
import { addTransfer, deleteTransfer } from "@/app/actions/transfers"

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

const TABS = [
  { key: "pendapatan",  label: "Pendapatan" },
  { key: "pengeluaran", label: "Pengeluaran" },
  { key: "dipinjam",    label: "Dipinjam" },
  { key: "hutang",      label: "Hutang" },
  { key: "transfer",    label: "Transfer" },
]

function formatRupiah(amount: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(amount))
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

function expenseStatus(pct: number, max: number, spent: number): "DANGER" | "WARNING" | "NORMAL" {
  if (pct <= 0 || max <= 0) return "NORMAL"
  const sisa = max - spent
  if (sisa < 0) return "DANGER"
  if (sisa < max * 0.2) return "WARNING"
  return "NORMAL"
}

type IncomeRow      = { id: string; date: string; name: string; category_id: string | null; category_name: string | null; wallet_id: string | null; wallet_name: string | null; amount: number; is_initial: number }
type ExpenseRow     = { id: string; date: string; name: string; wallet_id: string | null; wallet_name: string | null; category_id: string | null; category_name: string | null; needs_type: string; amount: number; is_initial: number }
type LoanGivenRow   = { id: string; borrower: string; amount: number; status: string; notes: string | null }
type LoanTakenRow   = { id: string; lender: string; amount: number; notes: string | null }
type TransferRow    = { id: string; date: string; amount: number; notes: string | null; from_wallet_name: string; from_wallet_color: string | null; to_wallet_name: string; to_wallet_color: string | null }
type LiquidWallet   = { id: string; name: string; color: string | null }
type IncomeCatRow   = { id: string; name: string }
type ExpenseCatRow  = { id: string; name: string; type_name: string; default_percentage: number }

export default async function YearDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = LOCAL_USER_ID

  const { year: yearStr } = await params
  const year = parseInt(yearStr)
  if (isNaN(year)) redirect("/rekap")

  if (year === new Date().getFullYear()) {
    ensureYearlyCategories(userId, year)
  }

  const isActive = true
  const sp       = await searchParams

  const view     = sp.view === "report" ? "report" : "manage"
  const detail   = sp.detail === "pendapatan" ? "pendapatan" : sp.detail === "pengeluaran" ? "pengeluaran" : null
  const rawMonth = typeof sp.bulan === "string" ? parseInt(sp.bulan) : new Date().getMonth() + 1
  const month    = Math.max(1, Math.min(12, isNaN(rawMonth) ? 1 : rawMonth))
  const tab      = ["pendapatan", "pengeluaran", "dipinjam", "hutang", "transfer"].includes(sp.tab as string)
    ? (sp.tab as string) : "pendapatan"
  const showNew    = sp.new === "1" && isActive
  const editId     = typeof sp.edit === "string" && isActive ? sp.edit as string : null
  const showReport = sp.report === "1" && tab === "pengeluaran"
  const stat       = sp.stat === "income_growth" ? "income_growth"
                   : sp.stat === "expense_ratio"  ? "expense_ratio"
                   : sp.stat === "wealth_growth"  ? "wealth_growth"
                   : null

  // Best-year helper
  const bestYearCTE = (table: string) => `
    WITH best_year AS (
      SELECT COALESCE(
        (SELECT MAX(year) FROM ${table} WHERE user_id = ? AND year = ?),
        (SELECT MAX(year) FROM ${table} WHERE user_id = ? AND year < ?),
        (SELECT MAX(year) FROM ${table} WHERE user_id = ?)
      ) AS y
    )`

  const incomeCats = db.prepare<unknown[], IncomeCatRow>(
    `${bestYearCTE("income_categories")}
     SELECT id, name FROM income_categories, best_year
     WHERE user_id = ? AND is_hidden = 0 AND year = best_year.y
     ORDER BY sort_order`
  ).all(userId, year, userId, year, userId, userId) as IncomeCatRow[]

  const expenseCats = db.prepare<unknown[], ExpenseCatRow>(
    `${bestYearCTE("expense_categories")}
     SELECT ec.id, ec.name, et.name AS type_name, ec.default_percentage
     FROM expense_categories ec
     JOIN expense_types et ON et.id = ec.type_id, best_year
     WHERE ec.user_id = ? AND ec.is_hidden = 0 AND ec.year = best_year.y
     ORDER BY et.sort_order, ec.sort_order`
  ).all(userId, year, userId, year, userId, userId) as ExpenseCatRow[]

  const wallets = db.prepare<[string], { id: string; name: string }>(
    "SELECT id, name FROM wallets WHERE user_id = ? AND is_active = 1 ORDER BY sort_order"
  ).all(userId) as { id: string; name: string }[]

  // ── Monthly data ──────────────────────────────────────────────────────────────
  const incomes = db.prepare<[string, number, number], IncomeRow>(
    `SELECT i.id, i.date, i.name, i.category_id, ic.name AS category_name,
            i.wallet_id, w.name AS wallet_name, i.amount, i.is_initial
     FROM incomes i
     LEFT JOIN income_categories ic ON ic.id = i.category_id
     LEFT JOIN wallets w ON w.id = i.wallet_id
     WHERE i.user_id = ? AND i.year = ? AND i.month = ?
     ORDER BY i.date DESC, i.created_at DESC`
  ).all(userId, year, month) as IncomeRow[]

  const expenses = db.prepare<[string, number, number], ExpenseRow>(
    `SELECT e.id, e.date, e.name, e.wallet_id, w.name AS wallet_name,
            e.category_id, ec.name AS category_name, e.needs_type, e.amount, e.is_initial
     FROM expenses e
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     LEFT JOIN wallets w ON w.id = e.wallet_id
     WHERE e.user_id = ? AND e.year = ? AND e.month = ?
     ORDER BY e.date DESC, e.created_at DESC`
  ).all(userId, year, month) as ExpenseRow[]

  const loansGiven = db.prepare<[string, number, number], LoanGivenRow>(
    `SELECT id, borrower, amount, status, notes FROM loans_given
     WHERE user_id = ? AND year = ? AND month = ?
     ORDER BY created_at DESC`
  ).all(userId, year, month) as LoanGivenRow[]

  const loansTaken = db.prepare<[string, number, number], LoanTakenRow>(
    `SELECT id, lender, amount, notes FROM loans_taken
     WHERE user_id = ? AND year = ? AND month = ?
     ORDER BY created_at DESC`
  ).all(userId, year, month) as LoanTakenRow[]

  // ── Yearly aggregate data (replaces yearly_recap table) ───────────────────────
  const totalIncomeRow  = db.prepare<[string, number]>("SELECT COALESCE(SUM(amount), 0) AS total FROM incomes  WHERE user_id=? AND year=?").get(userId, year) as { total: number }
  const totalExpenseRow = db.prepare<[string, number]>("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE user_id=? AND year=?").get(userId, year) as { total: number }
  const totalIncome  = totalIncomeRow.total
  const totalExpense = totalExpenseRow.total
  const hasData      = totalIncome > 0 || totalExpense > 0

  const incomeMoRows  = db.prepare<[string, number]>("SELECT month, COALESCE(SUM(amount),0) AS total FROM incomes  WHERE user_id=? AND year=? GROUP BY month").all(userId, year)  as { month: number; total: number }[]
  const expenseMoRows = db.prepare<[string, number]>("SELECT month, COALESCE(SUM(amount),0) AS total FROM expenses WHERE user_id=? AND year=? GROUP BY month").all(userId, year) as { month: number; total: number }[]
  const incomeMo: Record<string, number>  = {}
  const expenseMo: Record<string, number> = {}
  for (const r of incomeMoRows)  incomeMo[String(r.month)]  = r.total
  for (const r of expenseMoRows) expenseMo[String(r.month)] = r.total

  // expense breakdown by category & month
  const expByCatMonthRows = db.prepare<[string, number]>(
    "SELECT category_id, month, COALESCE(SUM(amount),0) AS total FROM expenses WHERE user_id=? AND year=? AND category_id IS NOT NULL GROUP BY category_id, month"
  ).all(userId, year) as { category_id: string; month: number; total: number }[]
  const expBdSpendMap = new Map<string, Record<string, number>>()
  for (const r of expByCatMonthRows) {
    if (!expBdSpendMap.has(r.category_id)) expBdSpendMap.set(r.category_id, {})
    expBdSpendMap.get(r.category_id)![String(r.month)] = r.total
  }

  // prev year income_monthly (for income growth Jan vs Dec prev year)
  const prevIncomeMoRows = db.prepare<[string, number]>("SELECT month, COALESCE(SUM(amount),0) AS total FROM incomes WHERE user_id=? AND year=? GROUP BY month").all(userId, year - 1) as { month: number; total: number }[]
  const prevIncomeMo: Record<string, number> = {}
  for (const r of prevIncomeMoRows) prevIncomeMo[String(r.month)] = r.total
  const hasPrevYear = prevIncomeMoRows.length > 0

  // ── Report charts ─────────────────────────────────────────────────────────────
  const needsChartRows = db.prepare<[string, number, number]>(
    "SELECT needs_type AS label, COALESCE(SUM(amount),0) AS total FROM expenses WHERE user_id=? AND year=? AND month=? GROUP BY needs_type"
  ).all(userId, year, month) as { label: string; total: number }[]

  const catChartRows = db.prepare<[string, number, number]>(
    `SELECT COALESCE(ec.name, 'Lainnya') AS label, COALESCE(SUM(e.amount),0) AS total
     FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.user_id=? AND e.year=? AND e.month=?
     GROUP BY ec.name ORDER BY SUM(e.amount) DESC`
  ).all(userId, year, month) as { label: string; total: number }[]

  // ── Income breakdown (only when detail open) ──────────────────────────────────
  let incomeBdRaw: { category_name: string; sort_order: number; month: number | null; total: number }[] = []
  if (view === "report" && detail === "pendapatan") {
    incomeBdRaw = db.prepare<unknown[]>(
      `${bestYearCTE("income_categories")}
       SELECT ic.name AS category_name, ic.sort_order, i.month, COALESCE(SUM(i.amount),0) AS total
       FROM income_categories ic, best_year
       LEFT JOIN incomes i ON i.category_id = ic.id AND i.year = ? AND i.user_id = ?
       WHERE ic.user_id = ? AND ic.is_hidden = 0 AND ic.year = best_year.y
       GROUP BY ic.name, ic.sort_order, i.month
       ORDER BY ic.sort_order, ic.name, i.month`
    ).all(userId, year, userId, year, userId, year, userId) as { category_name: string; sort_order: number; month: number | null; total: number }[]
  }

  // ── Budget % per category per month ───────────────────────────────────────────
  let budgetRows: { cat_id: string; month: number; pct: number }[] = []
  if (view === "report" && detail === "pengeluaran") {
    budgetRows = db.prepare<[string, number]>(
      "SELECT category_id AS cat_id, month, percentage AS pct FROM budgets WHERE user_id = ? AND year = ?"
    ).all(userId, year) as { cat_id: string; month: number; pct: number }[]
  }

  // ── Transfers ─────────────────────────────────────────────────────────────────
  let transfers: TransferRow[]  = []
  let liquidWallets: LiquidWallet[] = []
  if (tab === "transfer") {
    transfers = db.prepare<[string, number, number]>(
      `SELECT t.id, t.date, t.amount, t.notes,
              fw.name AS from_wallet_name, fw.color AS from_wallet_color,
              tw.name AS to_wallet_name,   tw.color AS to_wallet_color
       FROM transfers t
       JOIN wallets fw ON fw.id = t.from_wallet_id
       JOIN wallets tw ON tw.id = t.to_wallet_id
       WHERE t.user_id=? AND t.year=? AND t.month=?
       ORDER BY t.date DESC, t.created_at DESC`
    ).all(userId, year, month) as TransferRow[]

    liquidWallets = db.prepare<[string]>(
      "SELECT id, name, color FROM wallets WHERE user_id=? AND is_active=1 AND is_liquid=1 ORDER BY sort_order"
    ).all(userId) as LiquidWallet[]
  }

  // ── Build computed structures ─────────────────────────────────────────────────
  const bdMonths = [1,2,3,4,5,6,7,8,9,10,11,12]

  const bdCategoryOrder: string[] = []
  const bdCatMonthMap = new Map<string, Map<number, number>>()
  for (const row of incomeBdRaw) {
    if (!bdCatMonthMap.has(row.category_name)) {
      bdCategoryOrder.push(row.category_name)
      bdCatMonthMap.set(row.category_name, new Map())
    }
    if (row.month !== null) {
      bdCatMonthMap.get(row.category_name)!.set(row.month, row.total)
    }
  }
  const bdMonthTotals = bdMonths.map((m) => bdCategoryOrder.reduce((s, cat) => s + (bdCatMonthMap.get(cat)?.get(m) ?? 0), 0))
  const bdGrandTotal  = bdMonthTotals.reduce((s, t) => s + t, 0)

  type FreshExpCat = { id: string; name: string; type_name: string; default_percentage: number; months: Record<string, number> }
  type ExpenseGroup = { typeName: string; cats: FreshExpCat[] }
  const expGroups: ExpenseGroup[] = []
  for (const cat of expenseCats) {
    const last     = expGroups[expGroups.length - 1]
    const enriched: FreshExpCat = { ...cat, months: expBdSpendMap.get(cat.id) ?? {} }
    if (!last || last.typeName !== cat.type_name) expGroups.push({ typeName: cat.type_name, cats: [enriched] })
    else last.cats.push(enriched)
  }
  const allExpCats    = expGroups.flatMap((g) => g.cats)
  const expMonthSpent = bdMonths.map((m) => allExpCats.reduce((s, c) => s + (c.months[String(m)] ?? 0), 0))

  const budgetMap = new Map<string, Map<number, number>>()
  for (const row of budgetRows) {
    if (!budgetMap.has(row.cat_id)) budgetMap.set(row.cat_id, new Map())
    budgetMap.get(row.cat_id)!.set(row.month, row.pct)
  }
  const catRepPct   = (id: string) => Math.max(0, ...Array.from(budgetMap.get(id)?.values() ?? [0]))
  const getMonthPct = (id: string, m: number) => budgetMap.get(id)?.get(m) ?? catRepPct(id)

  const needsMap   = new Map(needsChartRows.map((r) => [r.label, r.total]))
  const needsChart = (["PRIMER", "SEKUNDER", "TERSIER"] as const).map((k) => ({ label: k, total: needsMap.get(k) ?? 0 }))
  const catChart   = catChartRows.map((r) => ({ label: r.label, total: r.total }))

  // ── Stat charts ───────────────────────────────────────────────────────────────
  const growthData: { label: string; value: number }[] = []
  for (let m = 1; m <= 12; m++) {
    const current = incomeMo[String(m)] ?? 0
    if (current === 0) continue
    let prev: number
    if (m === 1) {
      if (!hasPrevYear) continue
      prev = prevIncomeMo["12"] ?? 0
    } else {
      prev = incomeMo[String(m - 1)] ?? 0
    }
    growthData.push({ label: MONTHS[m - 1].substring(0, 3), value: current - prev })
  }
  const avgIncomeGrowth = growthData.length > 0 ? growthData.reduce((s, d) => s + d.value, 0) / growthData.length : null

  const ratioData: { label: string; value: number }[] = []
  for (let m = 1; m <= 12; m++) {
    const income  = incomeMo[String(m)]  ?? 0
    const expense = expenseMo[String(m)] ?? 0
    if (income <= 0) continue
    ratioData.push({ label: MONTHS[m - 1].substring(0, 3), value: parseFloat(((expense / income) * 100).toFixed(2)) })
  }
  const avgExpenseRatio = ratioData.length > 0 ? ratioData.reduce((s, d) => s + d.value, 0) / ratioData.length : null

  const wealthData: { label: string; nominal: number; pct: number }[] = []
  for (let m = 1; m <= 12; m++) {
    const income  = incomeMo[String(m)]  ?? 0
    const expense = expenseMo[String(m)] ?? 0
    if (income <= 0) continue
    const nominal = income - expense
    wealthData.push({ label: MONTHS[m - 1].substring(0, 3), nominal, pct: parseFloat(((nominal / income) * 100).toFixed(2)) })
  }
  const avgWealthNominal = wealthData.length > 0 ? wealthData.reduce((s, d) => s + d.nominal, 0) / wealthData.length : null
  const avgWealthPct     = wealthData.length > 0 ? wealthData.reduce((s, d) => s + d.pct,     0) / wealthData.length : null

  const MONTH_ABBRS_CHART = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"]

  const incomeCatTotals = bdCategoryOrder.map((cat) => ({
    name:  cat,
    total: bdMonths.reduce((s, m) => s + (bdCatMonthMap.get(cat)?.get(m) ?? 0), 0),
  }))

  const expCatYearlyTotals = allExpCats
    .map((cat) => ({ name: cat.name, total: Object.values(cat.months).reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.total - a.total)

  const expStackedMonthly = bdMonths.map((m) => {
    const row: Record<string, number | string> = { month: MONTH_ABBRS_CHART[m - 1] }
    let total = 0
    for (const cat of allExpCats) {
      const v = cat.months[String(m)] ?? 0
      row[`${cat.name}_raw`] = v
      total += v
    }
    row._total = total
    for (const cat of allExpCats) {
      const raw = row[`${cat.name}_raw`] as number
      row[cat.name] = total > 0 ? parseFloat(((raw / total) * 100).toFixed(2)) : 0
    }
    return row
  })

  const expCategoryNames = allExpCats.map((c) => c.name)

  const base       = `/rekap/${year}`
  const cancelHref = `${base}?bulan=${month}&tab=${tab}`
  const tambahHref = `${cancelHref}&new=1`

  const tabLabel: Record<string, string> = {
    pendapatan: "Pendapatan", pengeluaran: "Pengeluaran",
    dipinjam: "Pinjaman", hutang: "Hutang", transfer: "Transfer",
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href="/rekap"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Cashflow {year}</h1>
            <p className="text-sm text-muted-foreground">Detail keuangan per bulan</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`${base}/kategori-budget`}>Kategori &amp; Budget</Link>
        </Button>
      </div>

      <div className="flex gap-1 border-b pb-0">
        <Link href={`${base}?bulan=${month}&tab=${tab}`}
          className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${view === "manage" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Manage Keuangan
        </Link>
        <Link href={`${base}?view=report`}
          className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${view === "report" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          Report
        </Link>
      </div>

      {/* ── Report view ── */}
      {view === "report" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Link href={detail === "pendapatan" ? `${base}?view=report` : `${base}?view=report&detail=pendapatan`} className="block">
              <Card className={`transition-all hover:shadow-md cursor-pointer ${detail === "pendapatan" ? "ring-2 ring-emerald-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">Total Pendapatan</p>
                  <p className="text-lg font-bold text-emerald-600">{formatRupiah(totalIncome)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{detail === "pendapatan" ? "▲ Tutup detail" : "▼ Lihat detail"}</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={detail === "pengeluaran" ? `${base}?view=report` : `${base}?view=report&detail=pengeluaran`} className="block">
              <Card className={`transition-all hover:shadow-md cursor-pointer ${detail === "pengeluaran" ? "ring-2 ring-rose-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">Total Pengeluaran</p>
                  <p className="text-lg font-bold text-red-600">{formatRupiah(totalExpense)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{detail === "pengeluaran" ? "▲ Tutup detail" : "▼ Lihat detail"}</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={stat === "income_growth" ? `${base}?view=report` : `${base}?view=report&stat=income_growth`} className="block">
              <Card className={`transition-all hover:shadow-md cursor-pointer ${stat === "income_growth" ? "ring-2 ring-violet-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">AVG Kenaikan Pendapatan</p>
                  <p className={`text-lg font-bold tabular-nums ${avgIncomeGrowth === null ? "text-muted-foreground" : avgIncomeGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {avgIncomeGrowth === null ? "—" : `${avgIncomeGrowth > 0 ? "+" : ""}${formatRupiah(avgIncomeGrowth)}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{stat === "income_growth" ? "▲ Tutup chart" : "▼ Lihat chart"}</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={stat === "expense_ratio" ? `${base}?view=report` : `${base}?view=report&stat=expense_ratio`} className="block">
              <Card className={`transition-all hover:shadow-md cursor-pointer ${stat === "expense_ratio" ? "ring-2 ring-amber-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-1">AVG % Pengeluaran</p>
                  <p className={`text-lg font-bold tabular-nums ${avgExpenseRatio === null ? "text-muted-foreground" : avgExpenseRatio > 100 ? "text-red-600" : avgExpenseRatio > 80 ? "text-amber-600" : "text-emerald-600"}`}>
                    {avgExpenseRatio === null ? "—" : `${avgExpenseRatio.toFixed(1)}%`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{stat === "expense_ratio" ? "▲ Tutup chart" : "▼ Lihat chart"}</p>
                </CardContent>
              </Card>
            </Link>
            <Link href={stat === "wealth_growth" ? `${base}?view=report` : `${base}?view=report&stat=wealth_growth`} className="block col-span-2">
              <Card className={`transition-all hover:shadow-md cursor-pointer ${stat === "wealth_growth" ? "ring-2 ring-cyan-500" : ""}`}>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground mb-2">Kenaikan Kekayaan</p>
                  <div className="flex items-end gap-6">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">AVG Nominal</p>
                      <p className={`text-lg font-bold tabular-nums ${avgWealthNominal === null ? "text-muted-foreground" : avgWealthNominal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {avgWealthNominal === null ? "—" : `${avgWealthNominal > 0 ? "+" : ""}${formatRupiah(avgWealthNominal)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">AVG % dari Pendapatan</p>
                      <p className={`text-lg font-bold tabular-nums ${avgWealthPct === null ? "text-muted-foreground" : avgWealthPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {avgWealthPct === null ? "—" : `${avgWealthPct > 0 ? "+" : ""}${avgWealthPct.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{stat === "wealth_growth" ? "▲ Tutup chart" : "▼ Lihat chart"}</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {stat === "income_growth"  && <StatChart type="income_growth"  data={growthData} />}
          {stat === "expense_ratio"  && <StatChart type="expense_ratio"  data={ratioData} />}
          {stat === "wealth_growth"  && <StatChart type="wealth_growth"  data={wealthData} />}

          {!hasData && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Belum ada data pendapatan atau pengeluaran untuk tahun {year}.
            </p>
          )}

          {detail === "pengeluaran" && (
            <ExpenseDetailTabs year={year} categories={expCategoryNames} stackedData={expStackedMonthly} catTotals={expCatYearlyTotals}>
              {expGroups.length > 0 ? (
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
                              <th key={m} colSpan={4} className="px-3 py-2.5 text-center font-semibold border-l border-rose-500">{m.toUpperCase()}</th>
                            ))}
                          </tr>
                          <tr className="bg-rose-700 text-white">
                            {bdMonths.map((m) => ([
                              <th key={`${m}-max`}  className="px-2 py-2 text-right min-w-[110px] border-l border-rose-600">MAX</th>,
                              <th key={`${m}-out`}  className="px-2 py-2 text-right min-w-[110px]">PENGELUARAN</th>,
                              <th key={`${m}-sisa`} className="px-2 py-2 text-right min-w-[100px]">SISA</th>,
                              <th key={`${m}-sts`}  className="px-2 py-2 text-center min-w-[72px]">STATUS</th>,
                            ]))}
                          </tr>
                        </thead>
                        <tbody>
                          {expGroups.map(({ typeName, cats }) =>
                            cats.map((cat, ci) => {
                              const isLastInGroup = ci === cats.length - 1
                              const repPct = catRepPct(cat.id)
                              return (
                                <tr key={cat.id} className={`${isLastInGroup ? "border-b-2 border-border" : "border-b border-border/40"} ${ci % 2 === 0 ? "bg-muted/30" : ""}`}>
                                  <td className={`w-[100px] px-3 py-2.5 text-center font-semibold sticky left-0 z-10 border-r border-border bg-background ${ci === 0 ? "align-top pt-3" : ""}`}>{ci === 0 ? typeName : ""}</td>
                                  <td className="w-[150px] px-3 py-2.5 font-medium sticky left-[80px] z-10 border-r border-border bg-background">{cat.name}</td>
                                  <td className="min-w-[72px] max-w-[72px] px-3 py-2.5 text-right tabular-nums sticky left-[230px] z-10 bg-background border-r border-border text-muted-foreground">
                                    {repPct > 0 ? `${repPct.toFixed(2)}%` : "—"}
                                  </td>
                                  {bdMonths.map((m) => {
                                    const monthPct    = getMonthPct(cat.id, m)
                                    const monthIncome = incomeMo[String(m)] ?? 0
                                    const maxBudget   = monthIncome * (monthPct / 100)
                                    const spent       = cat.months[String(m)] ?? 0
                                    const sisa        = maxBudget - spent
                                    const status      = expenseStatus(monthPct, maxBudget, spent)
                                    const statusCls   = status === "DANGER" ? "bg-red-500 text-white" : status === "WARNING" ? "bg-amber-400 text-white" : "bg-emerald-500 text-white"
                                    return [
                                      <td key={`${m}-max`}  className="px-2 py-2.5 text-right tabular-nums text-muted-foreground border-l border-border">{monthPct > 0 ? formatRupiah(maxBudget) : "—"}</td>,
                                      <td key={`${m}-out`}  className="px-2 py-2.5 text-right tabular-nums">{formatRupiah(spent)}</td>,
                                      <td key={`${m}-sisa`} className={`px-2 py-2.5 text-right tabular-nums ${sisa < 0 ? "text-red-600 font-medium" : ""}`}>{monthPct > 0 ? formatRupiah(sisa) : "—"}</td>,
                                      <td key={`${m}-sts`}  className="px-2 py-2.5 text-center border-r border-border/30"><span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${statusCls}`}>{status}</span></td>,
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
                            <td className="min-w-[72px] max-w-[72px] px-3 py-2.5 text-right sticky left-[250px] bg-rose-700 z-10 border-r border-rose-600">TOTAL</td>
                            {bdMonths.map((m) => [
                              <td key={`${m}-max`}  className="px-2 py-2.5 border-l border-rose-500" />,
                              <td key={`${m}-out`}  className="px-2 py-2.5 text-right tabular-nums">{formatRupiah(expMonthSpent[m - 1])}</td>,
                              <td key={`${m}-sisa`} className="px-2 py-2.5" />,
                              <td key={`${m}-sts`}  className="px-2 py-2.5" />,
                            ])}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pengeluaran untuk tahun ini.</p>
              )}
            </ExpenseDetailTabs>
          )}

          {detail === "pendapatan" && (
            <IncomeDetailTabs year={year} chartData={incomeCatTotals}>
              {bdCategoryOrder.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-emerald-600 text-white">
                            <th className="w-[140px] px-4 py-3 text-left font-semibold sticky left-0 bg-emerald-600 z-10">NAMA</th>
                            {MONTHS.map((m) => (
                              <th key={m} className="px-3 py-3 text-right font-semibold min-w-[110px]">{m.toUpperCase()}</th>
                            ))}
                            <th className="px-4 py-3 text-right font-semibold min-w-[120px]">TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bdCategoryOrder.map((cat, ci) => {
                            const catTotal = bdMonths.reduce((s, m) => s + (bdCatMonthMap.get(cat)?.get(m) ?? 0), 0)
                            return (
                              <tr key={cat} className={`border-b ${ci % 2 === 0 ? "bg-muted/30" : ""}`}>
                                <td className="w-[140px] px-4 py-2.5 font-medium sticky left-0 z-10 bg-background">{cat}</td>
                                {bdMonths.map((m) => (
                                  <td key={m} className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                    {formatRupiah(bdCatMonthMap.get(cat)?.get(m) ?? 0)}
                                  </td>
                                ))}
                                <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{formatRupiah(catTotal)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-emerald-700 text-white">
                            <td className="px-4 py-3 font-bold sticky left-0 bg-emerald-700 z-10">TOTAL</td>
                            {bdMonthTotals.map((t, i) => (
                              <td key={i} className="px-3 py-3 text-right tabular-nums font-bold">{formatRupiah(t)}</td>
                            ))}
                            <td className="px-4 py-3 text-right tabular-nums font-bold">{formatRupiah(bdGrandTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pendapatan untuk tahun ini.</p>
              )}
            </IncomeDetailTabs>
          )}
        </div>
      )}

      {/* ── Manage Keuangan view ── */}
      {view === "manage" && (
        <div className="grid grid-cols-[176px_1fr] gap-5 items-start">
          <Card>
            <CardContent className="p-1.5">
              {MONTHS.map((name, i) => {
                const m      = i + 1
                const active = m === month
                return (
                  <Link key={m} href={`${base}?bulan=${m}&tab=${tab}`}
                    className={`flex items-center rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                    {name}
                  </Link>
                )
              })}
            </CardContent>
          </Card>

          <div className="space-y-4 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{MONTHS[month - 1]} {year}</h2>
              {!showNew && !showReport && !editId && isActive && (
                <Button asChild size="sm">
                  <Link href={tambahHref}><Plus className="h-4 w-4 mr-1" />Tambah {tabLabel[tab]}</Link>
                </Button>
              )}
            </div>

            <div className="flex gap-0 border-b">
              {TABS.map((t) => (
                <Link key={t.key} href={`${base}?bulan=${month}&tab=${t.key}`}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </Link>
              ))}
            </div>

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
                  {tab === "pendapatan"  && <IncomeForm   action={addIncome}   year={year} month={month} categories={incomeCats}  wallets={wallets} />}
                  {tab === "pengeluaran" && <ExpenseForm  action={addExpense}  year={year} month={month} categories={expenseCats} wallets={wallets} />}
                  {tab === "dipinjam"    && <LoanGivenForm action={addLoanGiven} year={year} month={month} />}
                  {tab === "hutang"      && <LoanTakenForm action={addLoanTaken} year={year} month={month} />}
                  {tab === "transfer"    && <TransferForm wallets={liquidWallets} action={addTransfer} year={year} month={month} />}
                </CardContent>
              </Card>
            )}

            {editId && !showReport && (() => {
              const incomeRow  = tab === "pendapatan"  ? incomes.find((r) => r.id === editId)    : null
              const expenseRow = tab === "pengeluaran" ? expenses.find((r) => r.id === editId)   : null
              const loanGivRow = tab === "dipinjam"    ? loansGiven.find((r) => r.id === editId) : null
              const loanTakRow = tab === "hutang"      ? loansTaken.find((r) => r.id === editId) : null
              const found      = incomeRow ?? expenseRow ?? loanGivRow ?? loanTakRow
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
                      <IncomeForm action={updateIncome.bind(null, editId)} year={year} month={month} categories={incomeCats} wallets={wallets}
                        defaultValues={{ date: incomeRow.date, name: incomeRow.name, categoryId: incomeRow.category_id, walletId: incomeRow.wallet_id, amount: incomeRow.amount, isInitial: !!incomeRow.is_initial }}
                        submitLabel="Simpan Perubahan" />
                    )}
                    {expenseRow && (
                      <ExpenseForm action={updateExpense.bind(null, editId)} year={year} month={month} categories={expenseCats} wallets={wallets}
                        defaultValues={{ date: expenseRow.date, name: expenseRow.name, walletId: expenseRow.wallet_id, categoryId: expenseRow.category_id, needsType: expenseRow.needs_type, amount: expenseRow.amount, isInitial: !!expenseRow.is_initial }}
                        submitLabel="Simpan Perubahan" />
                    )}
                    {loanGivRow && (
                      <LoanGivenForm action={updateLoanGiven.bind(null, editId)} year={year} month={month}
                        defaultValues={{ borrower: loanGivRow.borrower, amount: loanGivRow.amount, status: loanGivRow.status, notes: loanGivRow.notes }}
                        submitLabel="Simpan Perubahan" />
                    )}
                    {loanTakRow && (
                      <LoanTakenForm action={updateLoanTaken.bind(null, editId)} year={year} month={month}
                        defaultValues={{ lender: loanTakRow.lender, amount: loanTakRow.amount, notes: loanTakRow.notes }}
                        submitLabel="Simpan Perubahan" />
                    )}
                  </CardContent>
                </Card>
              )
            })()}

            {/* Pendapatan tab */}
            {tab === "pendapatan" && (
              <Card>
                <CardContent className="p-0">
                  {incomes.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pendapatan bulan ini.</p>
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
                              <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                              <td className="px-4 py-3 font-medium">
                                <div className="flex items-center gap-2">
                                  {row.name}
                                  {!!row.is_initial && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">AWAL</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{row.category_name ?? "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground">{row.wallet_name ?? "—"}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-600">{formatRupiah(row.amount)}</td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                    <Link href={`${base}?bulan=${month}&tab=pendapatan&edit=${row.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                                  </Button>
                                  <form action={deleteIncome.bind(null, row.id, yearStr, String(month))}>
                                    <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </form>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/20">
                            <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600">{formatRupiah(incomes.reduce((s, r) => s + r.amount, 0))}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pengeluaran tab */}
            {tab === "pengeluaran" && (
              <>
                <div className="flex justify-start">
                  <Link href={showReport ? `${base}?bulan=${month}&tab=pengeluaran` : `${base}?bulan=${month}&tab=pengeluaran&report=1`}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${showReport ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground border-border"}`}>
                    Report Pengeluaran
                  </Link>
                </div>
                {showReport ? (
                  <ReportTab needsData={needsChart} categoryData={catChart} />
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      {expenses.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pengeluaran bulan ini.</p>
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
                                  <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                                  <td className="px-4 py-3 font-medium">
                                    <div className="flex items-center gap-2">
                                      {row.name}
                                      {!!row.is_initial && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">AWAL</span>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">{row.wallet_name ?? "—"}</td>
                                  <td className="px-4 py-3 text-muted-foreground">{row.category_name ?? "—"}</td>
                                  <td className="px-4 py-3">
                                    <Badge variant={row.needs_type === "PRIMER" ? "default" : row.needs_type === "SEKUNDER" ? "secondary" : "outline"} className="text-xs">{row.needs_type}</Badge>
                                  </td>
                                  <td className="px-4 py-3 text-right tabular-nums font-medium text-red-600">{formatRupiah(row.amount)}</td>
                                  <td className="px-3 py-3 text-right">
                                    <div className="flex items-center justify-end gap-0.5">
                                      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                        <Link href={`${base}?bulan=${month}&tab=pengeluaran&edit=${row.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                                      </Button>
                                      <form action={deleteExpense.bind(null, row.id, yearStr, String(month))}>
                                        <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                      </form>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-muted/20">
                                <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                                <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">{formatRupiah(expenses.reduce((s, r) => s + r.amount, 0))}</td>
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

            {/* Dipinjam tab */}
            {tab === "dipinjam" && (
              <Card>
                <CardContent className="p-0">
                  {loansGiven.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data pinjaman bulan ini.</p>
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
                              <td className="px-4 py-3 text-right tabular-nums font-medium">{formatRupiah(row.amount)}</td>
                              <td className="px-4 py-3">
                                <Badge variant={row.status === "FIX" ? "success" : "warning"} className="text-xs">{row.status}</Badge>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{row.notes ?? "—"}</td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                    <Link href={`${base}?bulan=${month}&tab=dipinjam&edit=${row.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                                  </Button>
                                  <form action={deleteLoanGiven.bind(null, row.id, yearStr, String(month))}>
                                    <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </form>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/20">
                            <td className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold">{formatRupiah(loansGiven.reduce((s, r) => s + r.amount, 0))}</td>
                            <td colSpan={3} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Hutang tab */}
            {tab === "hutang" && (
              <Card>
                <CardContent className="p-0">
                  {loansTaken.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Belum ada data hutang bulan ini.</p>
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
                              <td className="px-4 py-3 text-right tabular-nums font-medium">{formatRupiah(row.amount)}</td>
                              <td className="px-4 py-3 text-muted-foreground">{row.notes ?? "—"}</td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                    <Link href={`${base}?bulan=${month}&tab=hutang&edit=${row.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                                  </Button>
                                  <form action={deleteLoanTaken.bind(null, row.id, yearStr, String(month))}>
                                    <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                  </form>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/20">
                            <td className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold">{formatRupiah(loansTaken.reduce((s, r) => s + r.amount, 0))}</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Transfer tab */}
            {tab === "transfer" && (
              <Card>
                <CardContent className="p-0">
                  {transfers.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">Belum ada transfer bulan ini.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-muted-foreground">
                            <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                            <th className="px-4 py-3 text-left font-medium">Dari</th>
                            <th className="px-4 py-3 text-left font-medium">Ke</th>
                            <th className="px-4 py-3 text-right font-medium">Jumlah</th>
                            <th className="px-4 py-3 text-left font-medium">Catatan</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {transfers.map((row) => (
                            <tr key={row.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {row.from_wallet_color && <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ backgroundColor: row.from_wallet_color }} />}
                                  <span className="font-medium">{row.from_wallet_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {row.to_wallet_color && <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ backgroundColor: row.to_wallet_color }} />}
                                  <span className="font-medium">{row.to_wallet_name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-600">{formatRupiah(row.amount)}</td>
                              <td className="px-4 py-3 text-muted-foreground">{row.notes ?? "—"}</td>
                              <td className="px-3 py-3 text-right">
                                <form action={deleteTransfer.bind(null, row.id, yearStr, String(month))}>
                                  <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </form>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-muted/20">
                            <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                            <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-600">{formatRupiah(transfers.reduce((s, r) => s + r.amount, 0))}</td>
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
        </div>
      )}
    </div>
  )
}
