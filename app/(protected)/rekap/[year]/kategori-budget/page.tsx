export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { ensureYearlyCategories } from "@/lib/ensureYearlyCategories"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import {
  KategoriBudgetTab,
  type KatIncomeCat,
  type KatExpenseType,
  type KatExpenseCat,
} from "../_components/kategori-budget-tab"

type IncomeRaw  = { id: string; name: string; color: string | null; is_hidden: number }
type TypeRaw    = { id: string; name: string; allocation: number | null }
type ExpCatRaw  = { id: string; name: string; type_id: string; type_name: string; is_hidden: number; budget_pct: number | null; nominal_budget: number | null }
type YearBudgetRaw = { max_expense_pct: number | null }

export default async function KategoriBudgetPage({
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

  const sp = await searchParams
  const ktab         = sp.ktab === "expense" ? "expense" : "income"
  const editKIncome  = typeof sp.edit_kincome  === "string" ? sp.edit_kincome  : null
  const editKExpense = typeof sp.edit_kexpense === "string" ? sp.edit_kexpense : null
  const allocError   = sp.alloc_error === "1"
  const rawMonth     = typeof sp.bulan === "string" ? parseInt(sp.bulan) : new Date().getMonth() + 1
  const month        = Math.max(1, Math.min(12, isNaN(rawMonth) ? 1 : rawMonth))

  const yearBudgetRow = db.prepare<[string, number], YearBudgetRaw>(
    "SELECT max_expense_pct FROM year_budget_settings WHERE user_id=? AND year=?"
  ).get(userId, year) as YearBudgetRaw | undefined
  const maxExpensePct = yearBudgetRow?.max_expense_pct ?? 100

  const katIncomeRows = (db.prepare<[string, number], IncomeRaw>(
    "SELECT id, name, color, is_hidden FROM income_categories WHERE user_id=? AND year=? ORDER BY sort_order, name"
  ).all(userId, year) as IncomeRaw[]).map<KatIncomeCat>((r) => ({ ...r, is_hidden: !!r.is_hidden }))

  const katTypeRows = (db.prepare<[string, number, string, number], TypeRaw>(
    `SELECT et.id, et.name, COALESCE(ta.percentage, 0) AS allocation
     FROM expense_types et
     LEFT JOIN type_allocations ta ON ta.type_id = et.id AND ta.user_id = ? AND ta.year = ?
     WHERE et.user_id = ? AND et.year = ?
     ORDER BY et.sort_order, et.name`
  ).all(userId, year, userId, year) as TypeRaw[]).map<KatExpenseType>((r) => ({ id: r.id, name: r.name, allocation: String(r.allocation ?? 0) }))

  const katExpCatRows = (db.prepare<[string, number, number, string, number, string, number], ExpCatRaw>(
    `SELECT ec.id, ec.name, ec.type_id, et.name AS type_name, ec.is_hidden,
            b.percentage AS budget_pct,
            nb.nominal AS nominal_budget
     FROM expense_categories ec
     JOIN expense_types et ON et.id = ec.type_id
     LEFT JOIN budgets b ON b.category_id = ec.id AND b.user_id = ? AND b.month = ? AND b.year = ?
     LEFT JOIN category_nominal_budgets nb ON nb.category_id = ec.id AND nb.user_id = ? AND nb.year = ?
     WHERE ec.user_id = ? AND ec.year = ?
     ORDER BY ec.sort_order, ec.name`
  ).all(userId, month, year, userId, year, userId, year) as ExpCatRaw[]).map<KatExpenseCat>((r) => ({
    id: r.id, name: r.name, type_id: r.type_id, type_name: r.type_name,
    is_hidden: !!r.is_hidden,
    budget_pct: r.budget_pct != null ? String(r.budget_pct) : null,
    nominal_budget: r.nominal_budget ?? null,
  }))

  const katByType = katExpCatRows.reduce<Record<string, KatExpenseCat[]>>((acc, cat) => {
    acc[cat.type_id] ??= []
    acc[cat.type_id].push(cat)
    return acc
  }, {})
  const katAllocTotal = katTypeRows.reduce((s, t) => s + parseFloat(t.allocation), 0)
  const katAllocOk    = Math.abs(katAllocTotal - 100) <= 0.01 || katTypeRows.length === 0

  const base = `/rekap/${year}/kategori-budget`

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href={`/rekap/${year}`}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Kategori &amp; Budget {year}</h1>
          <p className="text-sm text-muted-foreground">Kelola kategori dan budget tahunan</p>
        </div>
      </div>

      <KategoriBudgetTab
        year={year}
        month={month}
        base={base}
        incomeCategories={katIncomeRows}
        types={katTypeRows}
        byType={katByType}
        allocTotal={katAllocTotal}
        allocOk={katAllocOk}
        maxExpensePct={maxExpensePct}
        activeKTab={ktab}
        editKIncome={editKIncome}
        editKExpense={editKExpense}
        allocError={allocError}
        isActive={true}
      />
    </div>
  )
}
