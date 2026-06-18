import { db } from "@/lib/db"

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

export type NetWorthData    = { total: number; liquid: number; nonLiquid: number; changePercent: number | null }
export type WealthOverviewData = {
  totalDompet: number
  totalInvestasi: number
  totalKekayaan: number
  liquidDompet: number
  nonLiquidDompet: number
  liquidInvestasi: number
  nonLiquidInvestasi: number
  totalLiquid: number
  totalNonLiquid: number
  piutangSisa: number
  piutangMacetSisa: number
  hutangSisa: number
  monthlyGrowth: { month: number; label: string; income: number; expense: number; investGain: number }[]
  yearlyGrowth:  { year: number; income: number; expense: number; investGain: number }[]
  emergencyFundMonths: number
  avgMonthlyExpense: number
}
export type CashflowData    = { totalIncome: number; totalExpense: number; investGain: number; totalEfektif: number; remaining: number; expenseRatio: number; savingRatio: number; incomeCount: number; expenseCount: number }
export type WalletItem      = { id: string; name: string; balance: number; color: string | null; isLiquid: boolean }
export type WalletData      = { activeCount: number; items: WalletItem[] }
export type GoalItem        = { id: string; name: string; totalModal: number; targetAmount: number | null; progress: number | null; status: "ON_TRACK" | "BEHIND" | "COMPLETED" | "NO_TARGET" }
export type InvestmentData  = { totalModal: number; totalSell: number; totalProfit: number; totalLoss: number; netProfitLoss: number; goals: GoalItem[] }
export type LoanItem        = { id: string; name: string; total: number; sisa: number; dueDate: string | null; status: "ONGOING" | "TERLAMBAT"; cicilanPerBulan: number | null }
export type LoanData        = { piutang: { totalSisa: number; items: LoanItem[] }; hutang: { totalSisa: number; items: LoanItem[] }; terlambatCount: number }
export type RecentTransaction = { id: string; type: "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT"; label: string; sublabel: string; amount: number; isCredit: boolean; date: Date }

export function getWealthOverview(userId: string, year: number): WealthOverviewData {
  const walletRow = db.prepare(`
    SELECT
      COALESCE(SUM(balance), 0)                                              AS total,
      COALESCE(SUM(CASE WHEN is_liquid = 1 THEN balance ELSE 0 END), 0)     AS liquid,
      COALESCE(SUM(CASE WHEN is_liquid = 0 THEN balance ELSE 0 END), 0)     AS non_liquid
    FROM wallets WHERE user_id = ? AND is_active = 1
  `).get(userId) as { total: number; liquid: number; non_liquid: number }

  const investRows = db.prepare(`
    SELECT i.is_liquid,
      COALESCE(SUM(CASE WHEN it.type = 'BUY'  THEN it.total_amount ELSE 0 END), 0) AS total_buy,
      COALESCE(SUM(CASE WHEN it.type = 'SELL' THEN it.total_amount ELSE 0 END), 0) AS total_sell
    FROM investments i
    LEFT JOIN investment_transactions it ON it.investment_id = i.id
    WHERE i.user_id = ? AND i.is_active = 1 AND i.is_closed = 0
    GROUP BY i.is_liquid
  `).all(userId) as { is_liquid: number; total_buy: number; total_sell: number }[]

  let liquidInvestasi = 0
  let nonLiquidInvestasi = 0
  for (const row of investRows) {
    const aktif = Math.max(0, row.total_buy - row.total_sell)
    if (row.is_liquid) liquidInvestasi += aktif
    else nonLiquidInvestasi += aktif
  }

  const piutangRow = db.prepare(`
    SELECT COALESCE(SUM(MAX(l.principal_amount - COALESCE(pp.total_pp, 0), 0)), 0) AS sisa
    FROM loans l
    LEFT JOIN (
      SELECT loan_id, SUM(principal_paid) AS total_pp FROM loan_payments GROUP BY loan_id
    ) pp ON pp.loan_id = l.id
    WHERE l.user_id = ? AND l.type = 'PIUTANG' AND l.is_active = 1
  `).get(userId) as { sisa: number }

  const hutangRow = db.prepare(`
    SELECT COALESCE(SUM(MAX(l.principal_amount - COALESCE(pp.total_pp, 0), 0)), 0) AS sisa
    FROM loans l
    LEFT JOIN (
      SELECT loan_id, SUM(principal_paid) AS total_pp FROM loan_payments GROUP BY loan_id
    ) pp ON pp.loan_id = l.id
    WHERE l.user_id = ? AND l.type = 'HUTANG' AND l.is_active = 1
  `).get(userId) as { sisa: number }

  const piutangMacetRow = db.prepare(`
    SELECT COALESCE(SUM(MAX(l.principal_amount - COALESCE(pp.total_pp, 0), 0)), 0) AS sisa
    FROM loans l
    LEFT JOIN (
      SELECT loan_id, SUM(principal_paid) AS total_pp FROM loan_payments GROUP BY loan_id
    ) pp ON pp.loan_id = l.id
    WHERE l.user_id = ? AND l.type = 'PIUTANG' AND l.is_active = 1 AND l.payment_likelihood = 'MACET'
  `).get(userId) as { sisa: number }

  const monthlyRows = db.prepare(`
    SELECT month,
      COALESCE(SUM(CASE WHEN src = 'i' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN src = 'e' THEN amount ELSE 0 END), 0) AS expense
    FROM (
      SELECT month, 'i' AS src, amount FROM incomes  WHERE user_id = ? AND year = ?
      UNION ALL
      SELECT month, 'e',        amount FROM expenses WHERE user_id = ? AND year = ?
    ) t
    GROUP BY month ORDER BY month
  `).all(userId, year, userId, year) as { month: number; income: number; expense: number }[]

  // Capital: (SELL - BUY) untuk investasi yang ditutup di bulan tersebut
  const monthlyCapitalRows = db.prepare(`
    SELECT CAST(strftime('%m', i.closed_at) AS INTEGER) AS month,
      COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END), 0) AS capital_gain
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ? AND i.is_closed = 1
      AND CAST(strftime('%Y', i.closed_at) AS INTEGER) = ?
    GROUP BY month
  `).all(userId, year) as { month: number; capital_gain: number }[]

  // Dividen: diterima di bulan tersebut
  const monthlyDividenRows = db.prepare(`
    SELECT CAST(strftime('%m', it.date) AS INTEGER) AS month,
      COALESCE(SUM(it.total_amount), 0) AS dividen
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ? AND it.type = 'DIVIDEND'
      AND CAST(strftime('%Y', it.date) AS INTEGER) = ?
    GROUP BY month
  `).all(userId, year) as { month: number; dividen: number }[]

  const yearlyRows = db.prepare(`
    SELECT year,
      COALESCE(SUM(CASE WHEN src = 'i' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN src = 'e' THEN amount ELSE 0 END), 0) AS expense
    FROM (
      SELECT year, 'i' AS src, amount FROM incomes  WHERE user_id = ?
      UNION ALL
      SELECT year, 'e',        amount FROM expenses WHERE user_id = ?
    ) t
    GROUP BY year ORDER BY year
  `).all(userId, userId) as { year: number; income: number; expense: number }[]

  const yearlyCapitalRows = db.prepare(`
    SELECT CAST(strftime('%Y', i.closed_at) AS INTEGER) AS year,
      COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END), 0) AS capital_gain
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ? AND i.is_closed = 1
    GROUP BY year
  `).all(userId) as { year: number; capital_gain: number }[]

  const yearlyDividenRows = db.prepare(`
    SELECT CAST(strftime('%Y', it.date) AS INTEGER) AS year,
      COALESCE(SUM(it.total_amount), 0) AS dividen
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ? AND it.type = 'DIVIDEND'
    GROUP BY year
  `).all(userId) as { year: number; dividen: number }[]

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"]
  const monthlyGrowth = Array.from({ length: 12 }, (_, i) => {
    const m    = i + 1
    const row  = monthlyRows.find(r => r.month === m)
    const cap  = monthlyCapitalRows.find(r => r.month === m)
    const div  = monthlyDividenRows.find(r => r.month === m)
    return {
      month: m, label: MONTH_LABELS[i],
      income:     row?.income       ?? 0,
      expense:    row?.expense      ?? 0,
      investGain: (cap?.capital_gain ?? 0) + (div?.dividen ?? 0),
    }
  })

  const now = new Date()
  const nowYM = now.getFullYear() * 12 + (now.getMonth() + 1)
  const expRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM expenses
    WHERE user_id = ?
      AND (year * 12 + month) >= ? AND (year * 12 + month) <= ?
  `).get(userId, nowYM - 3, nowYM - 1) as { total: number }
  const avgMonthlyExpense = expRow.total / 3

  const totalDompet    = walletRow.total
  const totalInvestasi = liquidInvestasi + nonLiquidInvestasi
  const totalKekayaan  = totalDompet + totalInvestasi
  const totalLiquid    = walletRow.liquid + liquidInvestasi
  const totalNonLiquid = walletRow.non_liquid + nonLiquidInvestasi

  return {
    totalDompet,
    totalInvestasi,
    totalKekayaan,
    liquidDompet:      walletRow.liquid,
    nonLiquidDompet:   walletRow.non_liquid,
    liquidInvestasi,
    nonLiquidInvestasi,
    totalLiquid,
    totalNonLiquid,
    piutangSisa:         piutangRow.sisa,
    piutangMacetSisa:    piutangMacetRow.sisa,
    hutangSisa:          hutangRow.sisa,
    monthlyGrowth,
    yearlyGrowth: yearlyRows.map(r => ({
      year:       r.year,
      income:     r.income,
      expense:    r.expense,
      investGain: (yearlyCapitalRows.find(c => c.year === r.year)?.capital_gain ?? 0)
                + (yearlyDividenRows.find(d => d.year === r.year)?.dividen       ?? 0),
    })),
    emergencyFundMonths: avgMonthlyExpense > 0 ? totalLiquid / avgMonthlyExpense : 0,
    avgMonthlyExpense,
  }
}

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
      SELECT 'i' AS src, amount FROM incomes  WHERE user_id=? AND month=? AND year=?
      UNION ALL
      SELECT 'e', amount         FROM expenses WHERE user_id=? AND month=? AND year=?
    ) t
  `).get(userId, month, year, userId, month, year) as { total_income: number; total_expense: number; income_count: number; expense_count: number }

  // Capital: (SELL - BUY) investasi yang ditutup di bulan ini
  const capitalRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END), 0) -
      COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END), 0) AS capital_gain
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ? AND i.is_closed = 1
      AND CAST(strftime('%m', i.closed_at) AS INTEGER) = ?
      AND CAST(strftime('%Y', i.closed_at) AS INTEGER) = ?
  `).get(userId, month, year) as { capital_gain: number }

  // Dividen: diterima bulan ini
  const dividenRow = db.prepare(`
    SELECT COALESCE(SUM(it.total_amount), 0) AS dividen
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    WHERE i.user_id = ? AND it.type = 'DIVIDEND'
      AND CAST(strftime('%m', it.date) AS INTEGER) = ?
      AND CAST(strftime('%Y', it.date) AS INTEGER) = ?
  `).get(userId, month, year) as { dividen: number }

  const totalIncome  = row.total_income
  const totalExpense = row.total_expense
  const investGain   = (capitalRow.capital_gain) + (dividenRow.dividen)
  const totalEfektif = totalIncome + investGain
  const remaining    = totalEfektif - totalExpense
  return {
    totalIncome,
    totalExpense,
    investGain,
    totalEfektif,
    remaining,
    expenseRatio: totalEfektif > 0 ? (totalExpense / totalEfektif) * 100 : 0,
    savingRatio:  totalEfektif > 0 ? (remaining    / totalEfektif) * 100 : 0,
    incomeCount:  row.income_count,
    expenseCount: row.expense_count,
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
    WHERE i.user_id = ? AND i.is_closed = 0
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
    totalModal: totalBuy, totalSell, totalProfit, totalLoss, netProfitLoss: netPL,
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

export type CategoryBreakdownItem = { name: string; total: number }
export type CategoryBreakdownData = {
  expenses: CategoryBreakdownItem[]
  incomes:  CategoryBreakdownItem[]
}

export function getCategoryBreakdown(userId: string, month: number, year: number): CategoryBreakdownData {
  const expRows = db.prepare(`
    SELECT COALESCE(ec.name, 'Lainnya') AS name, COALESCE(SUM(e.amount), 0) AS total
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.user_id = ? AND e.month = ? AND e.year = ?
    GROUP BY ec.name
    ORDER BY total DESC
  `).all(userId, month, year) as CategoryBreakdownItem[]

  const incRows = db.prepare(`
    SELECT COALESCE(ic.name, 'Lainnya') AS name, COALESCE(SUM(i.amount), 0) AS total
    FROM incomes i
    LEFT JOIN income_categories ic ON ic.id = i.category_id
    WHERE i.user_id = ? AND i.month = ? AND i.year = ?
    GROUP BY ic.name
    ORDER BY total DESC
  `).all(userId, month, year) as CategoryBreakdownItem[]

  return {
    expenses: expRows.filter(r => r.total > 0),
    incomes:  incRows.filter(r => r.total > 0),
  }
}

// ── Per-module recent transactions ──────────────────────────────────────────

export type RecentCashflowTx = {
  id: string
  type: "INCOME" | "EXPENSE" | "TRANSFER"
  label: string
  sublabel: string
  amount: number
  isCredit: boolean
  dateStr: string
}

export type RecentInvestmentTx = {
  id: string
  txType: "BUY" | "SELL"
  investmentName: string
  goalName: string | null
  amount: number
  dateStr: string
}

export type RecentLoanTx = {
  id: string
  loanName: string
  loanType: "PIUTANG" | "HUTANG"
  totalPaid: number
  notes: string | null
  dateStr: string
}

function dateCutoff(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export function getRecentCashflowTx(userId: string, days = 30, limit = 10): RecentCashflowTx[] {
  const cutoff = dateCutoff(days)

  const incomes = db.prepare(`
    SELECT i.id, i.date, i.name, c.name AS cat, i.amount
    FROM incomes i LEFT JOIN income_categories c ON c.id = i.category_id
    WHERE i.user_id = ? AND i.date >= ?
    ORDER BY i.date DESC, i.created_at DESC LIMIT ?
  `).all(userId, cutoff, limit) as { id: string; date: string; name: string; cat: string | null; amount: number }[]

  const expenses = db.prepare(`
    SELECT e.id, e.date, e.name, c.name AS cat, e.amount
    FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.user_id = ? AND e.date >= ?
    ORDER BY e.date DESC, e.created_at DESC LIMIT ?
  `).all(userId, cutoff, limit) as { id: string; date: string; name: string; cat: string | null; amount: number }[]

  const transfers = db.prepare(`
    SELECT t.id, t.date, t.amount, fw.name AS from_name, tw.name AS to_name
    FROM transfers t
    JOIN wallets fw ON fw.id = t.from_wallet_id
    JOIN wallets tw ON tw.id = t.to_wallet_id
    WHERE t.user_id = ? AND t.date >= ?
    ORDER BY t.date DESC, t.created_at DESC LIMIT ?
  `).all(userId, cutoff, limit) as { id: string; date: string; amount: number; from_name: string; to_name: string }[]

  const rows: RecentCashflowTx[] = [
    ...incomes.map(t => ({ id: `i-${t.id}`, type: "INCOME" as const, label: t.name, sublabel: t.cat ?? "-", amount: t.amount, isCredit: true, dateStr: t.date })),
    ...expenses.map(t => ({ id: `e-${t.id}`, type: "EXPENSE" as const, label: t.name, sublabel: t.cat ?? "-", amount: t.amount, isCredit: false, dateStr: t.date })),
    ...transfers.map(t => ({ id: `t-${t.id}`, type: "TRANSFER" as const, label: `Transfer ke ${t.to_name}`, sublabel: `dari ${t.from_name}`, amount: t.amount, isCredit: false, dateStr: t.date })),
  ]
  return rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr)).slice(0, limit)
}

export function getRecentInvestmentTx(userId: string, days = 30, limit = 10): RecentInvestmentTx[] {
  const cutoff = dateCutoff(days)
  const rows = db.prepare(`
    SELECT it.id, it.date, it.type, i.name AS investment_name, g.name AS goal_name, it.total_amount
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    LEFT JOIN investment_goals g ON g.id = it.goal_id
    WHERE i.user_id = ? AND it.date >= ?
    ORDER BY it.date DESC, it.created_at DESC LIMIT ?
  `).all(userId, cutoff, limit) as { id: string; date: string; type: string; investment_name: string; goal_name: string | null; total_amount: number }[]

  return rows.map(t => ({
    id: t.id,
    txType: t.type as "BUY" | "SELL",
    investmentName: t.investment_name,
    goalName: t.goal_name,
    amount: t.total_amount,
    dateStr: t.date,
  }))
}

export function getRecentLoanTx(userId: string, days = 30, limit = 10): RecentLoanTx[] {
  const cutoff = dateCutoff(days)
  const rows = db.prepare(`
    SELECT lp.id, lp.date, lp.total_paid, lp.notes, l.name AS loan_name, l.type AS loan_type
    FROM loan_payments lp
    JOIN loans l ON l.id = lp.loan_id
    WHERE l.user_id = ? AND lp.date >= ?
    ORDER BY lp.date DESC, lp.created_at DESC LIMIT ?
  `).all(userId, cutoff, limit) as { id: string; date: string; total_paid: number; notes: string | null; loan_name: string; loan_type: string }[]

  return rows.map(t => ({
    id: t.id,
    loanName: t.loan_name,
    loanType: t.loan_type as "PIUTANG" | "HUTANG",
    totalPaid: t.total_paid,
    notes: t.notes,
    dateStr: t.date,
  }))
}

// ── Legacy combined recent transactions ──────────────────────────────────────

export function getRecentTransactions(userId: string, limit = 10): RecentTransaction[] {
  const incomes = db.prepare(`
    SELECT i.id, i.date, i.name, c.name AS category_name, i.amount
    FROM incomes i
    LEFT JOIN income_categories c ON c.id = i.category_id
    WHERE i.user_id = ?
    ORDER BY i.date DESC, i.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; name: string; category_name: string | null; amount: number }[]

  const expenses = db.prepare(`
    SELECT e.id, e.date, e.name, c.name AS category_name, e.amount
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    WHERE e.user_id = ?
    ORDER BY e.date DESC, e.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; name: string; category_name: string | null; amount: number }[]

  const transfers = db.prepare(`
    SELECT t.id, t.date, t.amount, fw.name AS from_wallet_name, tw.name AS to_wallet_name
    FROM transfers t
    JOIN wallets fw ON fw.id = t.from_wallet_id
    JOIN wallets tw ON tw.id = t.to_wallet_id
    WHERE t.user_id = ?
    ORDER BY t.date DESC, t.created_at DESC LIMIT ?
  `).all(userId, limit) as { id: string; date: string; amount: number; from_wallet_name: string; to_wallet_name: string }[]

  const invests = db.prepare(`
    SELECT it.id, it.date, it.type, i.name AS investment_name, g.name AS goal_name, it.total_amount
    FROM investment_transactions it
    JOIN investments i ON i.id = it.investment_id
    LEFT JOIN investment_goals g ON g.id = it.goal_id
    WHERE i.user_id = ?
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
