export const dynamic = "force-dynamic"

import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
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

export default async function KategoriBudgetPage({
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

  if (year === new Date().getFullYear()) {
    await ensureYearlyCategories(userId, year)
  }

  const sp = await searchParams
  const ktab       = sp.ktab === "expense" ? "expense" : "income"
  const editKIncome  = typeof sp.edit_kincome  === "string" ? sp.edit_kincome  : null
  const editKExpense = typeof sp.edit_kexpense === "string" ? sp.edit_kexpense : null
  const allocError   = sp.alloc_error === "1"
  const rawMonth = typeof sp.bulan === "string" ? parseInt(sp.bulan) : new Date().getMonth() + 1
  const month    = Math.max(1, Math.min(12, isNaN(rawMonth) ? 1 : rawMonth))

  const [katIncomeRes, katTypesRes, katExpenseCatRes] = await Promise.all([
    pool.query<KatIncomeCat>(
      `SELECT id, name, color, is_hidden FROM income_categories
       WHERE user_id = $1 AND year = $2
       ORDER BY sort_order, name`,
      [userId, year],
    ),
    pool.query<KatExpenseType>(
      `SELECT et.id, et.name, COALESCE(ta.percentage, 0)::text AS allocation
       FROM expense_types et
       LEFT JOIN type_allocations ta ON ta.type_id = et.id AND ta.user_id = $1 AND ta.year = $2
       WHERE et.user_id = $1 AND et.year = $2
       ORDER BY et.sort_order, et.name`,
      [userId, year],
    ),
    pool.query<KatExpenseCat>(
      `SELECT ec.id, ec.name, ec.type_id, et.name AS type_name, ec.is_hidden,
              b.percentage::text AS budget_pct
       FROM expense_categories ec
       JOIN expense_types et ON et.id = ec.type_id
       LEFT JOIN budgets b ON b.category_id = ec.id AND b.user_id = $1 AND b.month = $2 AND b.year = $3
       WHERE ec.user_id = $1 AND ec.year = $3
       ORDER BY ec.sort_order, ec.name`,
      [userId, month, year],
    ),
  ])

  const katIncomeRows = katIncomeRes.rows
  const katTypeRows   = katTypesRes.rows
  const katExpCatRows = katExpenseCatRes.rows

  const katByType = katExpCatRows.reduce<Record<string, KatExpenseCat[]>>((acc, cat) => {
    acc[cat.type_id] ??= []
    acc[cat.type_id].push(cat)
    return acc
  }, {})
  const katAllocTotal = katTypeRows.reduce((s, t) => s + parseFloat(t.allocation), 0)
  const katAllocOk    = Math.abs(katAllocTotal - 100) <= 0.01

  const base = `/rekap/${year}/kategori-budget`

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
          <Link href={`/rekap/${year}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
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
        activeKTab={ktab}
        editKIncome={editKIncome}
        editKExpense={editKExpense}
        allocError={allocError}
      />
    </div>
  )
}
