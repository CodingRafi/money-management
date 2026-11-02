import { db } from "@/lib/db"
import { escapeHtml, formatAmount, orDash, shortCode, type TxnCard } from "./format"

// ── Tampilan transaksi ───────────────────────────────────────────────────────

export interface ExpenseView {
  id: string
  date: string
  name: string
  amount: number
  wallet_id: string | null
  wallet_name: string | null
  category_id: string | null
  category_name: string | null
  needs_type: string
  is_family_expense: number
}

export interface IncomeView {
  id: string
  date: string
  name: string
  amount: number
  wallet_id: string | null
  wallet_name: string | null
  category_id: string | null
  category_name: string | null
}

/** Ambil pengeluaran lengkap dengan nama wallet & kategori. */
export async function loadExpenseView(id: string): Promise<ExpenseView | undefined> {
  return await db.prepare(
    `SELECT e.id, e.date, e.name, e.amount, e.needs_type, e.is_family_expense,
            e.wallet_id, e.category_id,
            w.name AS wallet_name, ec.name AS category_name
     FROM expenses e
     LEFT JOIN wallets w ON w.id = e.wallet_id
     LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.id = ?`
  ).get(id) as ExpenseView | undefined
}

/** Ambil pemasukan lengkap dengan nama wallet & kategori. */
export async function loadIncomeView(id: string): Promise<IncomeView | undefined> {
  return await db.prepare(
    `SELECT i.id, i.date, i.name, i.amount,
            i.wallet_id, i.category_id,
            w.name AS wallet_name, ic.name AS category_name
     FROM incomes i
     LEFT JOIN wallets w ON w.id = i.wallet_id
     LEFT JOIN income_categories ic ON ic.id = i.category_id
     WHERE i.id = ?`
  ).get(id) as IncomeView | undefined
}

// ── Kartu output ─────────────────────────────────────────────────────────────

export function expenseCard(view: ExpenseView, title = "Pengeluaran berhasil ditambahkan"): TxnCard {
  return {
    title,
    id: view.id,
    fields: [
      { label: "Tanggal", value: view.date },
      { label: "Jumlah", value: formatAmount(Number(view.amount)) },
      { label: "Nama / Keterangan", value: escapeHtml(view.name) },
      { label: "Wallet sumber", value: orDash(view.wallet_name ? escapeHtml(view.wallet_name) : null) },
      { label: "Jenis Kebutuhan", value: view.needs_type },
      { label: "Kategori", value: orDash(view.category_name ? escapeHtml(view.category_name) : null) },
      { label: "Catat sebagai pengeluaran keluarga", value: view.is_family_expense ? "Y" : "N" },
    ],
  }
}

export function incomeCard(view: IncomeView, title = "Pendapatan berhasil ditambahkan"): TxnCard {
  return {
    title,
    id: view.id,
    fields: [
      { label: "Tanggal", value: view.date },
      { label: "Jumlah", value: formatAmount(Number(view.amount)) },
      { label: "Nama / Keterangan", value: escapeHtml(view.name) },
      { label: "Wallet sumber", value: orDash(view.wallet_name ? escapeHtml(view.wallet_name) : null) },
      { label: "Kategori", value: orDash(view.category_name ? escapeHtml(view.category_name) : null) },
    ],
  }
}

export function loanCard(v: {
  id: string
  name: string
  type: string
  principal_amount: number
  interest_rate: number
  start_date: string
  due_date: string | null
  wallet_name: string | null
}): TxnCard {
  return {
    title: v.type === "PIUTANG" ? "Pinjaman (piutang) berhasil ditambahkan" : "Pinjaman (hutang) berhasil ditambahkan",
    id: v.id,
    fields: [
      { label: "Nama / Keterangan", value: escapeHtml(v.name) },
      { label: "Pokok", value: formatAmount(Number(v.principal_amount)) },
      { label: "Bunga", value: `${Number(v.interest_rate)}%` },
      { label: "Tanggal mulai", value: v.start_date },
      { label: "Jatuh tempo", value: orDash(v.due_date) },
      { label: "Wallet sumber", value: orDash(v.wallet_name) },
    ],
  }
}

export function loanPaymentCard(v: {
  id: string
  loan_name: string
  principal_paid: number
  interest_paid: number
  total_paid: number
  date: string
  notes: string | null
}): TxnCard {
  return {
    title: "Cicilan berhasil ditambahkan",
    id: v.id,
    fields: [
      { label: "Tanggal", value: v.date },
      { label: "Pokok dibayar", value: formatAmount(Number(v.principal_paid)) },
      { label: "Bunga", value: formatAmount(Number(v.interest_paid)) },
      { label: "Total dibayar", value: formatAmount(Number(v.total_paid)) },
      { label: "Pinjaman", value: escapeHtml(v.loan_name) },
      { label: "Catatan", value: orDash(v.notes ? escapeHtml(v.notes) : null) },
    ],
  }
}

export function investmentCard(v: {
  id: string
  name: string
  category_name: string | null
  unit: string | null
  wallet_name: string | null
}): TxnCard {
  return {
    title: "Aset investasi berhasil ditambahkan",
    id: v.id,
    fields: [
      { label: "Nama / Keterangan", value: escapeHtml(v.name) },
      { label: "Kategori", value: orDash(v.category_name ? escapeHtml(v.category_name) : null) },
      { label: "Satuan", value: orDash(v.unit ? escapeHtml(v.unit) : null) },
      { label: "Wallet sumber", value: orDash(v.wallet_name) },
    ],
  }
}

export function investmentTxCard(v: {
  id: string
  investment_name: string
  type: string
  quantity: string
  unit?: string | null
  total_amount: number
  date: string
  from_wallet_name: string | null
  to_wallet_name: string | null
  notes: string | null
}): TxnCard {
  const label = v.type === "BUY" ? "Beli" : v.type === "SELL" ? "Jual" : "Dividen"
  return {
    title: `Transaksi investasi (${label.toLowerCase()}) berhasil ditambahkan`,
    id: v.id,
    fields: [
      { label: "Tanggal", value: v.date },
      { label: "Aset", value: escapeHtml(v.investment_name) },
      { label: "Jenis", value: label },
      { label: "Jumlah", value: `${v.quantity}${v.unit ? " " + v.unit : ""}` },
      { label: "Nilai", value: formatAmount(Number(v.total_amount)) },
      { label: "Dompet asal", value: orDash(v.from_wallet_name ? escapeHtml(v.from_wallet_name) : null) },
      { label: "Dompet tujuan", value: orDash(v.to_wallet_name ? escapeHtml(v.to_wallet_name) : null) },
      { label: "Catatan", value: orDash(v.notes ? escapeHtml(v.notes) : null) },
    ],
  }
}

/** Kartu ringkas untuk daftar transaksi (dipakai /riwayat & /revisi). */
export function historyCard(rows: {
  id: string
  date: string
  name: string
  amount: number
  kind: string
}[]): string {
  if (rows.length === 0) return "Belum ada transaksi tercatat."
  return rows
    .map(
      (r) =>
        `${r.date} · ${escapeHtml(r.name)} — ${formatAmount(Number(r.amount))} · ${r.kind} · ${shortCode(r.id)}`,
    )
    .join("\n")
}
