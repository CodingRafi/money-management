import { db } from "@/lib/db"

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

export type NetWorthData    = { total: number; liquid: number; nonLiquid: number; changePercent: number | null }
export type CashflowData    = { totalIncome: number; totalExpense: number; remaining: number; expenseRatio: number; savingRatio: number; incomeCount: number; expenseCount: number }
export type BudgetItem      = { categoryId: string; categoryName: string; target: number; realisasi: number; status: "AMAN" | "MENDEKATI" | "OVER" }
export type BudgetData      = { overBudgetCount: number; items: BudgetItem[] }
export type WalletItem      = { id: string; name: string; balance: number; color: string | null; isLiquid: boolean }
export type WalletData      = { activeCount: number; items: WalletItem[] }
export type GoalItem        = { id: string; name: string; totalModal: number; targetAmount: number | null; progress: number | null; status: "ON_TRACK" | "BEHIND" | "COMPLETED" | "NO_TARGET" }
export type InvestmentData  = { totalModal: number; totalProfit: number; totalLoss: number; netProfitLoss: number; goals: GoalItem[] }
export type LoanItem        = { id: string; name: string; total: number; sisa: number; dueDate: string | null; status: "ONGOING" | "TERLAMBAT"; cicilanPerBulan: number | null }
export type LoanData        = { piutang: { totalSisa: number; items: LoanItem[] }; hutang: { totalSisa: number; items: LoanItem[] }; terlambatCount: number }
export type RecentTransaction = { id: string; type: "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT"; label: string; sublabel: string; amount: number; isCredit: boolean; date: Date }

export function getNetWorth(userId: string): NetWorthData {
  const walletRow = db.prepare(`
    SELECT
      COALESCE(SUM(balance), 0)                                      AS total_all,
      COALESCE(SUM(CASE WHEN is_liquid THEN balance ELSE 0 END), 0)  AS liquid,
      COALESCE(SUM(CASE WHEN NOT is_liquid THEN balance ELSE 0 END), 0) AS non_liquid
    FROM wallets WHERE user_id = ? AND is_active = 1
  `).get(userId) as { total_all: number; liquid: number; non_liquid: number }

  const loanRow = db.prepare(`
    SELECT COALESCE(SUM(
      MAX(l.principal_amount - COALESCE(pp.total_pp, 0), 0)
    ), 0) AS total_hutang_sisa
    FROM loans l
    LEFT JOIN (SELECT loan_id, SUM(principal_paid) AS total_pp FROM loan_payments GROUP BY loan_id) pp ON pp.loan_id = l.id
    WHERE l.user_id = ? AND l.type = 'HUTANG' AND l.is_active = 1
  `).get(userId) as { total_hutang_sisa: number }

  const liquid    = walletRow.liquid
  const nonLiquid = walletRow.non_liquid
  return { total: walletRow.total_all - loanRow.total_hutang_sisa, liquid, nonLiquid, changePercent: null }
}

export function getCashflow(userId: string, month: number, year: number): CashflowData {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN src='i' THEN amount ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN src='e' THEN amount ELSE 0 END), 0) AS total_expense,
      COUNT(CASE WHEN src='i' THEN 1 END) AS income_count,
      COUNT(CASE WHEN src='e' THEN 1 END) AS expense_count
    FROM (
      SELECT 'i' AS src, amount FROM incomes  WHERE user_id=? AND month=? AND year=? AND is_initial=0
      UNION ALL
      SELECT 'e', amount         FROM expenses WHERE user_id=? AND month=? AND year=? AND is_initial=0
    ) t
  `).get(userId, month, year, userId, month, year) as { total_income: number; total_expense: number; income_count: number; expense_count: number }

  const totalIncome  = row.total_income
  const totalExpense = row.total_expense
  const remaining    = totalIncome - totalExpense
  return {
    totalIncome,
    totalExpense,
    remaining,
    expenseRatio: totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0,
    savingRatio:  totalIncome > 0 ? (remaining    / totalIncome) * 100 : 0,
    incomeCount:  row.income_count,
    expenseCount: row.expense_count,
  }
}

export function getBudget(userId: string, month: number, year: number): BudgetData {
  const incRow = db.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM incomes WHERE user_id=? AND month=? AND year=? AND is_initial=0"
  ).get(userId, month, year) as { total: number }
  const totalIncome = incRow.total

  const budgetRows = db.prepare(`
    WITH expense_by_cat AS (
      SELECT category_id, COALESCE(SUM(amount), 0) AS actual
      FROM expenses WHERE user_id=? AND month=? AND year=? AND is_initial=0
      GROUP BY category_id
    )
    SELECT ec.id AS category_id, ec.name AS category_name, b.percentage AS target,
           COALESCE(ebc.actual, 0) AS actual_amount
    FROM budgets b
    JOIN expense_categories ec ON ec.id = b.category_id
    LEFT JOIN expense_by_cat ebc ON ebc.category_id = b.category_id
    WHERE b.user_id=? AND b.month=? AND b.year=?
  `).all(userId, month, year, userId, month, year) as { category_id: string; category_name: string; target: number; actual_amount: number }[]

  const items: BudgetItem[] = budgetRows.map((row) => {
    const target       = row.target
    const targetAmount = totalIncome * (target / 100)
    const realisasi    = targetAmount > 0 ? (row.actual_amount / targetAmount) * 100 : 0
    const status: BudgetItem["status"] = realisasi > 100 ? "OVER" : realisasi >= 80 ? "MENDEKATI" : "AMAN"
    return { categoryId: row.category_id, categoryName: row.category_name, target, realisasi, status }
  })

  return {
    overBudgetCount: items.filter((i) => i.status === "OVER").length,
    items: [...items].sort((a, b) => b.realisasi - a.realisasi).slice(0, 5),
  }
}

export function getWallets(userId: string): WalletData {
  const rows = db.prepare(`
    SELECT id, name, balance, color, is_liquid
    FROM wallets WHERE user_id=? AND is_active=1 ORDER BY balance DESC
  `).all(userId) as { id: string; name: string; balance: number; color: string | null; is_liquid: number }[]

  return {
    activeCount: rows.length,
    items: rows.slice(0, 5).map((r) => ({ id: r.id, name: r.name, balance: r.balance, color: r.color, isLiquid: !!r.is_liquid })),
  }
}

export function getInvestment(userId: string): InvestmentData {
  const summaryRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END), 0) AS total_buy,
      COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END), 0) AS total_sell
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ?
  `).get(userId) as { total_buy: number; total_sell: number }

  const goalsRows = db.prepare(`
    SELECT g.id, g.name, g.target_amount,
           COALESCE(SUM(CASE WHEN it.type='BUY' THEN it.total_amount ELSE -it.total_amount END), 0) AS total_modal
    FROM investment_goals g
    LEFT JOIN investment_transactions it ON it.goal_id = g.id
    WHERE g.user_id = ? AND g.is_active = 1
    GROUP BY g.id, g.name, g.target_amount
    ORDER BY g.sort_order
  `).all(userId) as { id: string; name: string; target_amount: number | null; total_modal: number }[]

  const totalBuy    = summaryRow.total_buy
  const totalSell   = summaryRow.total_sell
  const netPL       = totalSell - totalBuy
  const totalProfit = netPL > 0 ? netPL : 0
  const totalLoss   = netPL < 0 ? Math.abs(netPL) : 0

  const goals: GoalItem[] = goalsRows.map((row) => {
    const modal    = row.total_modal
    const target   = row.target_amount ?? null
    const progress = target && target > 0 ? Math.min((modal / target) * 100, 100) : null
    const status: GoalItem["status"] =
      !target            ? "NO_TARGET"  :
      modal >= target    ? "COMPLETED"  :
      (progress ?? 0) >= 70 ? "ON_TRACK" : "BEHIND"
    return { id: row.id, name: row.name, totalModal: modal, targetAmount: target, progress, status }
  })

  return {
    totalModal: totalBuy, totalProfit, totalLoss, netProfitLoss: netPL,
    goals: [...goals].sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1)).slice(0, 3),
  }
}

export function getLoans(userId: string): LoanData {
  const rows = db.prepare(`
    SELECT l.id, l.type, l.name, l.principal_amount, l.due_date, l.status,
           COALESCE(SUM(lp.principal_paid), 0) AS total_pp
    FROM loans l
    LEFT JOIN loan_payments lp ON lp.loan_id = l.id
    WHERE l.user_id = ? AND l.is_active = 1
    GROUP BY l.id, l.type, l.name, l.principal_amount, l.due_date, l.status
    ORDER BY l.created_at DESC
  `).all(userId) as { id: string; type: string; name: string; principal_amount: number; due_date: string | null; status: string; total_pp: number }[]

  const piutangItems: LoanItem[] = []
  const hutangItems:  LoanItem[] = []
  const now = new Date()

  for (const row of rows) {
    const sisa = Math.max(0, row.principal_amount - row.total_pp)
    if (sisa <= 0) continue
    const status: "ONGOING" | "TERLAMBAT" = row.due_date && now > new Date(row.due_date) ? "TERLAMBAT" : "ONGOING"
    const item: LoanItem = { id: row.id, name: row.name, total: row.principal_amount, sisa, dueDate: row.due_date, status, cicilanPerBulan: null }
    if (row.type === "PIUTANG") piutangItems.push(item)
    else hutangItems.push(item)
  }

  const terlambatCount = [...piutangItems, ...hutangItems].filter((i) => i.status === "TERLAMBAT").length
  return {
    piutang: { totalSisa: piutangItems.reduce((s, i) => s + i.sisa, 0), items: piutangItems.slice(0, 2) },
    hutang:  { totalSisa: hutangItems.reduce((s, i)  => s + i.sisa, 0), items: hutangItems.slice(0, 2)  },
    terlambatCount,
  }
}

export function getRecentTransactions(userId: string, limit = 10): RecentTransaction[] {
  const incomes = db.prepare(`
    SELECT i.id, i.date, i.name, c.name AS category_name, i.amount
    FROM incomes i
    LEFT JOIN income_categories c ON c.id = i.category_id
    WHERE i.user_id = ? AND i.is_initial = 0
    ORDER BY i.date DESC, i.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; name: string; category_name: string | null; amount: number }[]

  const expenses = db.prepare(`
    SELECT e.id, e.date, e.name, c.name AS category_name, e.amount
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.user_id = ? AND e.is_initial = 0
    ORDER BY e.date DESC, e.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; name: string; category_name: string | null; amount: number }[]

  const transfers = db.prepare(`
    SELECT t.id, t.date, t.amount, fw.name AS from_wallet_name, tw.name AS to_wallet_name
    FROM transfers t
    JOIN wallets fw ON fw.id = t.from_wallet_id
    JOIN wallets tw ON tw.id = t.to_wallet_id
    WHERE t.user_id = ? AND t.is_initial = 0
    ORDER BY t.date DESC, t.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; amount: number; from_wallet_name: string; to_wallet_name: string }[]

  const invests = db.prepare(`
    SELECT it.id, it.date, it.type, i.name AS investment_name, g.name AS goal_name, it.total_amount
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    LEFT JOIN investment_goals g ON g.id = it.goal_id
    WHERE i.user_id = ? AND it.is_initial = 0
    ORDER BY it.date DESC, it.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; type: string; investment_name: string; goal_name: string | null; total_amount: number }[]

  const rows: RecentTransaction[] = [
    ...incomes.map((t) => ({ id: `i-${t.id}`, type: "INCOME" as const, label: t.name, sublabel: `${fmtDateShort(t.date)} • ${t.category_name ?? "-"}`, amount: t.amount, isCredit: true,  date: new Date(t.date) })),
    ...expenses.map((t) => ({ id: `e-${t.id}`, type: "EXPENSE" as const, label: t.name, sublabel: `${fmtDateShort(t.date)} • ${t.category_name ?? "-"}`, amount: t.amount, isCredit: false, date: new Date(t.date) })),
    ...transfers.map((t) => ({ id: `t-${t.id}`, type: "TRANSFER" as const, label: `Transfer ke ${t.to_wallet_name}`, sublabel: `${fmtDateShort(t.date)} • dari ${t.from_wallet_name}`, amount: t.amount, isCredit: false, date: new Date(t.date) })),
    ...invests.map((t) => ({ id: `v-${t.id}`, type: "INVESTMENT" as const, label: `${t.type} ${t.investment_name}`, sublabel: `${fmtDateShort(t.date)} • Investasi${t.goal_name ? ` • ${t.goal_name}` : ""}`, amount: t.total_amount, isCredit: t.type === "SELL", date: new Date(t.date) })),
  ]

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)
}
