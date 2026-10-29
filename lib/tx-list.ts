import { db } from "@/lib/db"

type ListOpts = {
  from?: string
  to?: string
  type?: string
  search?: string
  page?: number
  limit?: number
}

// ── Cashflow (income + expense + transfer) ──────────────────────────────────

export type CashflowTxItem = {
  id: string
  txType: "INCOME" | "EXPENSE" | "TRANSFER"
  name: string
  cat: string | null
  amount: number
  isCredit: boolean
  date: string
}

export async function getCashflowTxList(
  userId: string,
  { from, to, type = "all", search, page = 1, limit = 10 }: ListOpts = {}
): Promise<{ items: CashflowTxItem[]; total: number }> {
  const like = search ? `%${search}%` : null
  const all: CashflowTxItem[] = []

  if (type === "all" || type === "INCOME") {
    const c = ["i.user_id = ?"]
    const p: (string | null)[] = [userId]
    if (from) { c.push("i.date >= ?"); p.push(from) }
    if (to)   { c.push("i.date <= ?"); p.push(to) }
    if (like) { c.push("i.name ILIKE ?"); p.push(like) }
    const rows = await db.prepare(
      `SELECT i.id, i.date, i.name, c.name AS cat, i.amount
       FROM incomes i LEFT JOIN income_categories c ON c.id = i.category_id
       WHERE ${c.join(" AND ")} ORDER BY i.date DESC, i.created_at DESC`
    ).all(...p) as { id: string; date: string; name: string; cat: string | null; amount: number }[]
    all.push(...rows.map(r => ({ id: `i-${r.id}`, txType: "INCOME" as const, name: r.name, cat: r.cat, amount: r.amount, isCredit: true, date: r.date })))
  }

  if (type === "all" || type === "EXPENSE") {
    const c = ["e.user_id = ?"]
    const p: (string | null)[] = [userId]
    if (from) { c.push("e.date >= ?"); p.push(from) }
    if (to)   { c.push("e.date <= ?"); p.push(to) }
    if (like) { c.push("e.name ILIKE ?"); p.push(like) }
    const rows = await db.prepare(
      `SELECT e.id, e.date, e.name, c.name AS cat, e.amount
       FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
       WHERE ${c.join(" AND ")} ORDER BY e.date DESC, e.created_at DESC`
    ).all(...p) as { id: string; date: string; name: string; cat: string | null; amount: number }[]
    all.push(...rows.map(r => ({ id: `e-${r.id}`, txType: "EXPENSE" as const, name: r.name, cat: r.cat, amount: r.amount, isCredit: false, date: r.date })))
  }

  if (type === "all" || type === "TRANSFER") {
    const c = ["t.user_id = ?"]
    const p: (string | null)[] = [userId]
    if (from) { c.push("t.date >= ?"); p.push(from) }
    if (to)   { c.push("t.date <= ?"); p.push(to) }
    if (like) { c.push("(fw.name ILIKE ? OR tw.name ILIKE ?)"); p.push(like, like) }
    const rows = await db.prepare(
      `SELECT t.id, t.date, t.amount, fw.name AS from_name, tw.name AS to_name
       FROM transfers t
       JOIN wallets fw ON fw.id = t.from_wallet_id
       JOIN wallets tw ON tw.id = t.to_wallet_id
       WHERE ${c.join(" AND ")} ORDER BY t.date DESC, t.created_at DESC`
    ).all(...p) as { id: string; date: string; amount: number; from_name: string; to_name: string }[]
    all.push(...rows.map(r => ({ id: `t-${r.id}`, txType: "TRANSFER" as const, name: `Transfer ke ${r.to_name}`, cat: `dari ${r.from_name}`, amount: r.amount, isCredit: false, date: r.date })))
  }

  all.sort((a, b) => b.date.localeCompare(a.date))
  const total = all.length
  return { items: all.slice((page - 1) * limit, page * limit), total }
}

// ── Investment transactions ──────────────────────────────────────────────────

export type InvestmentTxItem = {
  id: string
  txType: "BUY" | "SELL" | "DIVIDEND"
  investmentName: string
  goalName: string | null
  amount: number
  date: string
}

export async function getInvestmentTxList(
  userId: string,
  { from, to, type = "all", search, page = 1, limit = 10 }: ListOpts = {}
): Promise<{ items: InvestmentTxItem[]; total: number }> {
  const like = search ? `%${search}%` : null
  const c = ["i.user_id = ?"]
  const p: (string | null)[] = [userId]
  if (from)          { c.push("it.date >= ?"); p.push(from) }
  if (to)            { c.push("it.date <= ?"); p.push(to) }
  if (type !== "all") { c.push("it.type = ?"); p.push(type) }
  if (like)          { c.push("(i.name ILIKE ? OR g.name ILIKE ?)"); p.push(like, like) }

  const rows = await db.prepare(
    `SELECT it.id, it.date, it.type, i.name AS investment_name, g.name AS goal_name, it.total_amount
     FROM investment_transactions it
     JOIN investments i ON i.id = it.investment_id
     LEFT JOIN investment_goals g ON g.id = it.goal_id
     WHERE ${c.join(" AND ")}
     ORDER BY it.date DESC, it.created_at DESC`
  ).all(...p) as { id: string; date: string; type: string; investment_name: string; goal_name: string | null; total_amount: number }[]

  const all: InvestmentTxItem[] = rows.map(r => ({
    id: r.id, txType: r.type as "BUY" | "SELL" | "DIVIDEND",
    investmentName: r.investment_name, goalName: r.goal_name,
    amount: r.total_amount, date: r.date,
  }))

  return { items: all.slice((page - 1) * limit, page * limit), total: all.length }
}

// ── Loan payments ────────────────────────────────────────────────────────────

export type LoanPaymentItem = {
  id: string
  loanName: string
  loanType: "PIUTANG" | "HUTANG"
  totalPaid: number
  principalPaid: number
  interestPaid: number
  notes: string | null
  date: string
}

export async function getLoanPaymentList(
  userId: string,
  { from, to, type = "all", search, page = 1, limit = 10 }: ListOpts = {}
): Promise<{ items: LoanPaymentItem[]; total: number }> {
  const like = search ? `%${search}%` : null
  const c = ["l.user_id = ?"]
  const p: (string | null)[] = [userId]
  if (from)          { c.push("lp.date >= ?"); p.push(from) }
  if (to)            { c.push("lp.date <= ?"); p.push(to) }
  if (type !== "all") { c.push("l.type = ?"); p.push(type) }
  if (like)          { c.push("(l.name ILIKE ? OR lp.notes ILIKE ?)"); p.push(like, like) }

  const rows = await db.prepare(
    `SELECT lp.id, lp.date, lp.total_paid, lp.principal_paid, lp.interest_paid, lp.notes,
            l.name AS loan_name, l.type AS loan_type
     FROM loan_payments lp
     JOIN loans l ON l.id = lp.loan_id
     WHERE ${c.join(" AND ")}
     ORDER BY lp.date DESC, lp.created_at DESC`
  ).all(...p) as { id: string; date: string; total_paid: number; principal_paid: number; interest_paid: number; notes: string | null; loan_name: string; loan_type: string }[]

  const all: LoanPaymentItem[] = rows.map(r => ({
    id: r.id, loanName: r.loan_name, loanType: r.loan_type as "PIUTANG" | "HUTANG",
    totalPaid: r.total_paid, principalPaid: r.principal_paid, interestPaid: r.interest_paid,
    notes: r.notes, date: r.date,
  }))

  return { items: all.slice((page - 1) * limit, page * limit), total: all.length }
}
