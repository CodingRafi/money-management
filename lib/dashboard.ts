import { pool } from "@/lib/db"

function fmtDateShort(d: Date | string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

// ── Types ──────────────────────────────────────────────────────────────────

export type NetWorthData = {
  total: number
  liquid: number
  nonLiquid: number
  changePercent: number | null
}

export type CashflowData = {
  totalIncome: number
  totalExpense: number
  remaining: number
  expenseRatio: number
  savingRatio: number
  incomeCount: number
  expenseCount: number
}

export type BudgetItem = {
  categoryId: string
  categoryName: string
  target: number
  realisasi: number
  status: "AMAN" | "MENDEKATI" | "OVER"
}

export type BudgetData = {
  overBudgetCount: number
  items: BudgetItem[]
}

export type WalletItem = {
  id: string
  name: string
  balance: number
  color: string | null
  isLiquid: boolean
}

export type WalletData = {
  activeCount: number
  items: WalletItem[]
}

export type GoalItem = {
  id: string
  name: string
  totalModal: number
  targetAmount: number | null
  progress: number | null
  status: "ON_TRACK" | "BEHIND" | "COMPLETED" | "NO_TARGET"
}

export type InvestmentData = {
  totalModal: number
  totalProfit: number
  totalLoss: number
  netProfitLoss: number
  goals: GoalItem[]
}

export type LoanItem = {
  id: string
  name: string
  total: number
  sisa: number
  dueDate: string | null
  status: "ONGOING" | "TERLAMBAT"
  cicilanPerBulan: number | null
}

export type LoanData = {
  piutang: { totalSisa: number; items: LoanItem[] }
  hutang: { totalSisa: number; items: LoanItem[] }
  terlambatCount: number
}

export type RecentTransaction = {
  id: string
  type: "INCOME" | "EXPENSE" | "TRANSFER" | "INVESTMENT"
  label: string
  sublabel: string
  amount: number
  isCredit: boolean
  date: Date
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getNetWorth(userId: string): Promise<NetWorthData> {
  const [walletRes, loanRes] = await Promise.all([
    pool.query<{ total_all: string; liquid: string; non_liquid: string }>(
      `SELECT
         COALESCE(SUM(balance), 0)::text                                    AS total_all,
         COALESCE(SUM(CASE WHEN is_liquid THEN balance ELSE 0 END), 0)::text AS liquid,
         COALESCE(SUM(CASE WHEN NOT is_liquid THEN balance ELSE 0 END), 0)::text AS non_liquid
       FROM wallets WHERE user_id=$1 AND is_active=true`,
      [userId],
    ),
    pool.query<{ total_hutang_sisa: string }>(
      `SELECT COALESCE(SUM(
         GREATEST(l.principal_amount - COALESCE(pp.total_pp, 0), 0)
       ), 0)::text AS total_hutang_sisa
       FROM loans l
       LEFT JOIN (
         SELECT loan_id, SUM(principal_paid) AS total_pp
         FROM loan_payments GROUP BY loan_id
       ) pp ON pp.loan_id=l.id
       WHERE l.user_id=$1 AND l.type='HUTANG' AND l.is_active=true`,
      [userId],
    ),
  ])

  const liquid = Number(walletRes.rows[0]?.liquid ?? 0)
  const nonLiquid = Number(walletRes.rows[0]?.non_liquid ?? 0)
  const totalWallet = Number(walletRes.rows[0]?.total_all ?? 0)
  const totalHutangSisa = Number(loanRes.rows[0]?.total_hutang_sisa ?? 0)

  return { total: totalWallet - totalHutangSisa, liquid, nonLiquid, changePercent: null }
}

export async function getCashflow(
  userId: string,
  month: number,
  year: number,
): Promise<CashflowData> {
  const res = await pool.query<{
    total_income: string
    total_expense: string
    income_count: string
    expense_count: string
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN src='i' THEN amount ELSE 0 END), 0)::text AS total_income,
       COALESCE(SUM(CASE WHEN src='e' THEN amount ELSE 0 END), 0)::text AS total_expense,
       COUNT(CASE WHEN src='i' THEN 1 END)::text AS income_count,
       COUNT(CASE WHEN src='e' THEN 1 END)::text AS expense_count
     FROM (
       SELECT 'i' AS src, amount FROM incomes
       WHERE user_id=$1 AND month=$2 AND year=$3 AND is_initial=false
       UNION ALL
       SELECT 'e', amount FROM expenses
       WHERE user_id=$1 AND month=$2 AND year=$3 AND is_initial=false
     ) t`,
    [userId, month, year],
  )

  const totalIncome = Number(res.rows[0]?.total_income ?? 0)
  const totalExpense = Number(res.rows[0]?.total_expense ?? 0)
  const remaining = totalIncome - totalExpense
  const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : 0
  const savingRatio = totalIncome > 0 ? (remaining / totalIncome) * 100 : 0

  return {
    totalIncome,
    totalExpense,
    remaining,
    expenseRatio,
    savingRatio,
    incomeCount: Number(res.rows[0]?.income_count ?? 0),
    expenseCount: Number(res.rows[0]?.expense_count ?? 0),
  }
}

export async function getBudget(
  userId: string,
  month: number,
  year: number,
): Promise<BudgetData> {
  const [incomeRes, budgetRes] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM incomes WHERE user_id=$1 AND month=$2 AND year=$3 AND is_initial=false`,
      [userId, month, year],
    ),
    pool.query<{ category_id: string; category_name: string; target: string; actual_amount: string }>(
      `WITH expense_by_cat AS (
         SELECT category_id, COALESCE(SUM(amount), 0) AS actual
         FROM expenses
         WHERE user_id=$1 AND month=$2 AND year=$3 AND is_initial=false
         GROUP BY category_id
       )
       SELECT
         ec.id   AS category_id,
         ec.name AS category_name,
         b.percentage::text AS target,
         COALESCE(ebc.actual, 0)::text AS actual_amount
       FROM budgets b
       JOIN expense_categories ec ON ec.id=b.category_id
       LEFT JOIN expense_by_cat ebc ON ebc.category_id=b.category_id
       WHERE b.user_id=$1 AND b.month=$2 AND b.year=$3`,
      [userId, month, year],
    ),
  ])

  const totalIncome = Number(incomeRes.rows[0]?.total ?? 0)

  const items: BudgetItem[] = budgetRes.rows.map(row => {
    const target = Number(row.target)
    const actualAmount = Number(row.actual_amount)
    const targetAmount = totalIncome * (target / 100)
    const realisasi = targetAmount > 0 ? (actualAmount / targetAmount) * 100 : 0
    const status: BudgetItem["status"] =
      realisasi > 100 ? "OVER" : realisasi >= 80 ? "MENDEKATI" : "AMAN"
    return { categoryId: row.category_id, categoryName: row.category_name, target, realisasi, status }
  })

  const sorted = [...items].sort((a, b) => b.realisasi - a.realisasi).slice(0, 5)

  return { overBudgetCount: items.filter(i => i.status === "OVER").length, items: sorted }
}

export async function getWallets(userId: string): Promise<WalletData> {
  const res = await pool.query<{
    id: string
    name: string
    balance: string
    color: string | null
    is_liquid: boolean
  }>(
    `SELECT id, name, balance::text, color, is_liquid
     FROM wallets WHERE user_id=$1 AND is_active=true
     ORDER BY balance DESC`,
    [userId],
  )

  return {
    activeCount: res.rows.length,
    items: res.rows.slice(0, 5).map(r => ({
      id: r.id,
      name: r.name,
      balance: Number(r.balance),
      color: r.color,
      isLiquid: r.is_liquid,
    })),
  }
}

export async function getInvestment(userId: string): Promise<InvestmentData> {
  const [summaryRes, goalsRes] = await Promise.all([
    pool.query<{ total_buy: string; total_sell: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END), 0)::text AS total_buy,
         COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END), 0)::text AS total_sell
       FROM investment_transactions it
       JOIN investments i ON i.id=it.investment_id
       WHERE i.user_id=$1`,
      [userId],
    ),
    pool.query<{ id: string; name: string; target_amount: string | null; total_modal: string }>(
      `SELECT g.id, g.name, g.target_amount::text,
              COALESCE(SUM(CASE WHEN it.type='BUY' THEN it.total_amount ELSE -it.total_amount END), 0)::text AS total_modal
       FROM investment_goals g
       LEFT JOIN investment_transactions it ON it.goal_id=g.id
       WHERE g.user_id=$1 AND g.is_active=true
       GROUP BY g.id, g.name, g.target_amount
       ORDER BY g.sort_order`,
      [userId],
    ),
  ])

  const totalBuy = Number(summaryRes.rows[0]?.total_buy ?? 0)
  const totalSell = Number(summaryRes.rows[0]?.total_sell ?? 0)
  const netProfitLoss = totalSell - totalBuy
  const totalProfit = netProfitLoss > 0 ? netProfitLoss : 0
  const totalLoss = netProfitLoss < 0 ? Math.abs(netProfitLoss) : 0

  const goals: GoalItem[] = goalsRes.rows.map(row => {
    const modal = Number(row.total_modal)
    const target = row.target_amount ? Number(row.target_amount) : null
    const progress = target && target > 0 ? Math.min((modal / target) * 100, 100) : null
    const status: GoalItem["status"] =
      !target ? "NO_TARGET" :
      modal >= target ? "COMPLETED" :
      progress !== null && progress >= 70 ? "ON_TRACK" : "BEHIND"
    return { id: row.id, name: row.name, totalModal: modal, targetAmount: target, progress, status }
  })

  const sortedGoals = [...goals]
    .sort((a, b) => (b.progress ?? -1) - (a.progress ?? -1))
    .slice(0, 3)

  return { totalModal: totalBuy, totalProfit, totalLoss, netProfitLoss, goals: sortedGoals }
}

export async function getLoans(userId: string): Promise<LoanData> {
  const res = await pool.query<{
    id: string
    type: string
    name: string
    principal_amount: string
    due_date: string | null
    status: string
    total_pp: string
  }>(
    `SELECT l.id, l.type, l.name, l.principal_amount::text,
            l.due_date::text, l.status,
            COALESCE(SUM(lp.principal_paid), 0)::text AS total_pp
     FROM loans l
     LEFT JOIN loan_payments lp ON lp.loan_id=l.id
     WHERE l.user_id=$1 AND l.is_active=true
     GROUP BY l.id, l.type, l.name, l.principal_amount, l.due_date, l.status
     ORDER BY l.created_at DESC`,
    [userId],
  )

  const piutangItems: LoanItem[] = []
  const hutangItems: LoanItem[] = []
  const now = new Date()

  for (const row of res.rows) {
    const sisa = Math.max(0, Number(row.principal_amount) - Number(row.total_pp))
    if (sisa <= 0) continue

    const dueDate = row.due_date
    const status: "ONGOING" | "TERLAMBAT" =
      dueDate && now > new Date(dueDate) ? "TERLAMBAT" : "ONGOING"

    const item: LoanItem = {
      id: row.id,
      name: row.name,
      total: Number(row.principal_amount),
      sisa,
      dueDate,
      status,
      cicilanPerBulan: null,
    }

    if (row.type === "PIUTANG") piutangItems.push(item)
    else hutangItems.push(item)
  }

  const terlambatCount = [...piutangItems, ...hutangItems].filter(i => i.status === "TERLAMBAT").length

  return {
    piutang: {
      totalSisa: piutangItems.reduce((s, i) => s + i.sisa, 0),
      items: piutangItems.slice(0, 2),
    },
    hutang: {
      totalSisa: hutangItems.reduce((s, i) => s + i.sisa, 0),
      items: hutangItems.slice(0, 2),
    },
    terlambatCount,
  }
}

export async function getRecentTransactions(
  userId: string,
  limit = 10,
): Promise<RecentTransaction[]> {
  const [incomesRes, expensesRes, transfersRes, investRes] = await Promise.all([
    pool.query<{ id: string; date: string; name: string; category_name: string | null; amount: string }>(
      `SELECT i.id, i.date::text, i.name, c.name AS category_name, i.amount::text
       FROM incomes i
       LEFT JOIN income_categories c ON c.id=i.category_id
       WHERE i.user_id=$1 AND i.is_initial=false
       ORDER BY i.date DESC, i.created_at DESC LIMIT $2`,
      [userId, limit],
    ),
    pool.query<{ id: string; date: string; name: string; category_name: string | null; amount: string }>(
      `SELECT e.id, e.date::text, e.name, c.name AS category_name, e.amount::text
       FROM expenses e
       LEFT JOIN expense_categories c ON c.id=e.category_id
       WHERE e.user_id=$1 AND e.is_initial=false
       ORDER BY e.date DESC, e.created_at DESC LIMIT $2`,
      [userId, limit],
    ),
    pool.query<{
      id: string; date: string; amount: string
      from_wallet_name: string; to_wallet_name: string
    }>(
      `SELECT t.id, t.date::text, t.amount::text,
              fw.name AS from_wallet_name, tw.name AS to_wallet_name
       FROM transfers t
       JOIN wallets fw ON fw.id=t.from_wallet_id
       JOIN wallets tw ON tw.id=t.to_wallet_id
       WHERE t.user_id=$1 AND t.is_initial=false
       ORDER BY t.date DESC, t.created_at DESC LIMIT $2`,
      [userId, limit],
    ),
    pool.query<{
      id: string; date: string; type: string
      investment_name: string; goal_name: string | null; total_amount: string
    }>(
      `SELECT it.id, it.date::text, it.type,
              i.name AS investment_name,
              g.name AS goal_name,
              it.total_amount::text
       FROM investment_transactions it
       JOIN investments i ON i.id=it.investment_id
       LEFT JOIN investment_goals g ON g.id=it.goal_id
       WHERE i.user_id=$1 AND it.is_initial=false
       ORDER BY it.date DESC, it.created_at DESC LIMIT $2`,
      [userId, limit],
    ),
  ])

  const rows: RecentTransaction[] = [
    ...incomesRes.rows.map(t => ({
      id: `i-${t.id}`,
      type: "INCOME" as const,
      label: t.name,
      sublabel: `${fmtDateShort(t.date)} • ${t.category_name ?? "-"}`,
      amount: Number(t.amount),
      isCredit: true,
      date: new Date(t.date),
    })),
    ...expensesRes.rows.map(t => ({
      id: `e-${t.id}`,
      type: "EXPENSE" as const,
      label: t.name,
      sublabel: `${fmtDateShort(t.date)} • ${t.category_name ?? "-"}`,
      amount: Number(t.amount),
      isCredit: false,
      date: new Date(t.date),
    })),
    ...transfersRes.rows.map(t => ({
      id: `t-${t.id}`,
      type: "TRANSFER" as const,
      label: `Transfer ke ${t.to_wallet_name}`,
      sublabel: `${fmtDateShort(t.date)} • dari ${t.from_wallet_name}`,
      amount: Number(t.amount),
      isCredit: false,
      date: new Date(t.date),
    })),
    ...investRes.rows.map(t => ({
      id: `v-${t.id}`,
      type: "INVESTMENT" as const,
      label: `${t.type} ${t.investment_name}`,
      sublabel: `${fmtDateShort(t.date)} • Investasi${t.goal_name ? ` • ${t.goal_name}` : ""}`,
      amount: Number(t.total_amount),
      isCredit: t.type === "SELL",
      date: new Date(t.date),
    })),
  ]

  return rows
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit)
}
