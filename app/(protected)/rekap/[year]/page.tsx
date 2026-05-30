import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
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

  const sp = await searchParams

  const rawMonth = typeof sp.bulan === "string" ? parseInt(sp.bulan) : new Date().getMonth() + 1
  const month    = Math.max(1, Math.min(12, isNaN(rawMonth) ? 1 : rawMonth))
  const tab        = ["pendapatan", "pengeluaran", "dipinjam", "hutang"].includes(sp.tab as string)
    ? (sp.tab as string)
    : "pendapatan"
  const showNew    = sp.new === "1"
  const editId     = typeof sp.edit === "string" ? sp.edit : null
  const showReport = sp.report === "1" && tab === "pengeluaran"

  // Reference data for forms
  const [incomeCatsRes, expenseCatsRes, walletsRes] = await Promise.all([
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM income_categories
       WHERE user_id = $1 AND is_hidden = false
       ORDER BY sort_order`,
      [userId],
    ),
    pool.query<{ id: string; name: string; type_name: string }>(
      `SELECT ec.id, ec.name, et.name AS type_name
       FROM expense_categories ec
       JOIN expense_types et ON et.id = ec.type_id
       WHERE ec.user_id = $1 AND ec.is_hidden = false
       ORDER BY et.sort_order, ec.sort_order`,
      [userId],
    ),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets
       WHERE user_id = $1 AND is_active = true
       ORDER BY sort_order`,
      [userId],
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

  const incomeCats  = incomeCatsRes.rows
  const expenseCats = expenseCatsRes.rows
  const wallets     = walletsRes.rows
  const incomes     = incomesRes.rows
  const expenses    = expensesRes.rows
  const loansGiven  = loansGivenRes.rows
  const loansTaken  = loansTakenRes.rows

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
        <span className="rounded-t-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground">
          Manage Keuangan
        </span>
        <span className="rounded-t-md px-4 py-2 text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed select-none">
          Report
        </span>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-[176px_1fr] gap-5 items-start">
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
      </div>
    </div>
  )
}
