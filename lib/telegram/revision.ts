import { db } from "@/lib/db"
import { expenseService } from "@/services/expense.service"
import {
  expenseCard,
  incomeCard,
  loadExpenseView,
  loadIncomeView,
  budgetFields,
  type ExpenseView,
  type IncomeView,
} from "./cards"
import { revisiHint, formatAmount, monthYear, orDash, shortCode, type TxnCard } from "./format"
import { getCategoryBudgetStatus } from "./budget-status"
import type { ToolContext } from "./tools"

/** Konteks revisi — tidak butuh tanggal hari ini. */
export type RevisionCtx = Omit<ToolContext, "today">

// ── Parsing nilai yang diketik user ───────────────────────────────────────────

/**
 * Parse nominal yang ditulis bebas: "30rb", "1,5jt", "50 k", "150000".
 * Mengembalikan null bila tidak bisa dibaca.
 */
export function parseAmountLoose(input: string): number | null {
  let s = input.toLowerCase().replace(/rp/g, "").replace(/\s/g, "").trim()
  if (!s) return null

  let multiplier = 1
  if (/(juta|jt)$/.test(s)) {
    multiplier = 1_000_000
    s = s.replace(/(juta|jt)$/, "")
  } else if (/(rb|k)$/.test(s)) {
    multiplier = 1_000
    s = s.replace(/(rb|k)$/, "")
  } else if (/m$/.test(s)) {
    multiplier = 1_000_000
    s = s.replace(/m$/, "")
  }

  // Pemisah ribuan Indonesia = titik, desimal = koma.
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".")
  else if (s.includes(",")) s = s.replace(",", ".")

  const value = parseFloat(s)
  if (!Number.isFinite(value) || value <= 0) return null
  return value * multiplier
}

/** Parse Y/N jadi boolean. */
export function parseYesNo(input: string): boolean | null {
  const s = input.trim().toLowerCase()
  if (["y", "ya", "yes", "true", "1"].includes(s)) return true
  if (["n", "tidak", "no", "false", "0"].includes(s)) return false
  return null
}

// ── Pencarian transaksi milik user ───────────────────────────────────────────

const FIND_EXPENSE = `
  SELECT e.id FROM expenses e
  WHERE e.user_id = ?
    AND (e.id = ? OR upper(right(replace(e.id, '-', ''), 6)) = upper(?))
  LIMIT 1`

const FIND_INCOME = `
  SELECT i.id FROM incomes i
  WHERE i.user_id = ?
    AND (i.id = ? OR upper(right(replace(i.id, '-', ''), 6)) = upper(?))
  LIMIT 1`

async function findExpenseId(userId: string, code: string): Promise<string | null> {
  const row = await db.prepare(FIND_EXPENSE).get(userId, code, code) as { id: string } | undefined
  return row?.id ?? null
}

async function findIncomeId(userId: string, code: string): Promise<string | null> {
  const row = await db.prepare(FIND_INCOME).get(userId, code, code) as { id: string } | undefined
  return row?.id ?? null
}

// ── Hasil revisi ─────────────────────────────────────────────────────────────

export type RevisionOutcome =
  | { ok: true; card: TxnCard; message: string }
  | { ok: false; message: string }

/** Patch isi field — semua berupa string bebas (hasil ketikan user / AI). */
export interface RevisionPatch {
  amount?: string
  name?: string
  date?: string
  category?: string
  wallet?: string
  needs_type?: string
  is_family_expense?: string
}

export interface RevisionFieldError {
  field: string
  message: string
}

/** Alias kata kunci field yang diketik user (Indonesia & Inggris). */
export const REVISION_FIELD_ALIASES: Record<string, RevisionPatchKey> = {
  jumlah: "amount",
  nominal: "amount",
  amount: "amount",
  harga: "amount",
  nama: "name",
  keterangan: "name",
  name: "name",
  tanggal: "date",
  date: "date",
  kategori: "category",
  category: "category",
  wallet: "wallet",
  dompet: "wallet",
  kebutuhan: "needs_type",
  needs: "needs_type",
  "jenis kebutuhan": "needs_type",
  keluarga: "is_family_expense",
  family: "is_family_expense",
}

export type RevisionPatchKey = keyof RevisionPatch

// ── Revisi pengeluaran ────────────────────────────────────────────────────────

export async function reviseExpense(
  ctx: RevisionCtx,
  code: string,
  patch: RevisionPatch,
): Promise<RevisionOutcome> {
  const id = await findExpenseId(ctx.session.userId, code.trim())
  if (!id) {
    return {
      ok: false,
      message: `Transaksi "${code}" tidak ditemukan. Cek kode di riwayat (/riwayat) lalu ulangi.`,
    }
  }

  const current = await loadExpenseView(id)
  if (!current) return { ok: false, message: "Data transaksi tidak bisa dibaca." }

  const errors: RevisionFieldError[] = []
  let amount = Number(current.amount)
  let name = current.name
  let date = current.date
  let needsType = current.needs_type
  let isFamily = !!current.is_family_expense
  // Field yang tidak di-revisi harus dipertahankan, bukan dikosongkan.
  let categoryId: string | null = current.category_id
  let walletId: string | null = current.wallet_id

  if (patch.amount !== undefined) {
    const parsed = parseAmountLoose(patch.amount)
    if (parsed === null) errors.push({ field: "jumlah", message: `Nominal "${patch.amount}" tidak bisa dibaca` })
    else amount = parsed
  }
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (!trimmed) errors.push({ field: "nama", message: "Nama tidak boleh kosong" })
    else name = trimmed
  }
  if (patch.date !== undefined) {
    const trimmed = patch.date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      errors.push({ field: "tanggal", message: "Tanggal harus format YYYY-MM-DD (contoh: 2026-11-02)" })
    } else {
      date = trimmed
    }
  }
  if (patch.needs_type !== undefined) {
    const value = patch.needs_type.trim().toUpperCase()
    if (!["PRIMER", "SEKUNDER", "TERSIER"].includes(value)) {
      errors.push({ field: "kebutuhan", message: "Jenis kebutuhan harus PRIMER, SEKUNDER, atau TERSIER" })
    } else {
      needsType = value
    }
  }
  if (patch.is_family_expense !== undefined) {
    const value = parseYesNo(patch.is_family_expense)
    if (value === null) errors.push({ field: "keluarga", message: "Isi dengan Y atau N" })
    else isFamily = value
  }
  if (patch.category !== undefined) {
    const raw = patch.category.trim()
    const byId = await db.prepare(
      "SELECT id FROM expense_categories WHERE household_id = ? AND id = ?"
    ).get(ctx.householdId, raw) as { id: string } | undefined
    const byName = byId
      ? undefined
      : await db.prepare(
          "SELECT id FROM expense_categories WHERE household_id = ? AND lower(name) = lower(?)"
        ).get(ctx.householdId, raw) as { id: string } | undefined
    if (!byId && !byName) errors.push({ field: "kategori", message: `Kategori "${raw}" tidak ditemukan` })
    else categoryId = (byId ?? byName)!.id
  }
  if (patch.wallet !== undefined) {
    const raw = patch.wallet.trim()
    const byId = await db.prepare(
      "SELECT id FROM wallets WHERE user_id = ? AND id = ?"
    ).get(ctx.session.userId, raw) as { id: string } | undefined
    const byName = byId
      ? undefined
      : await db.prepare(
          "SELECT id FROM wallets WHERE user_id = ? AND is_active = 1 AND lower(name) = lower(?)"
        ).get(ctx.session.userId, raw) as { id: string } | undefined
    if (!byId && !byName) errors.push({ field: "wallet", message: `Dompet "${raw}" tidak ditemukan` })
    else walletId = (byId ?? byName)!.id
  }

  if (errors.length > 0) {
    return {
      ok: false,
      message: errors.map((e) => `• ${e.field}: ${e.message}`).join("\n"),
    }
  }

  const { month, year } = monthYear(date)
  try {
    await expenseService.updateExpense(ctx.session, id, {
      name,
      amount,
      date,
      month,
      year,
      is_initial: false,
      wallet_id: walletId,
      category_id: categoryId,
      needs_type: needsType as "PRIMER" | "SEKUNDER" | "TERSIER",
      is_family_expense: isFamily,
    })
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Gagal menyimpan revisi" }
  }

  const updated = (await loadExpenseView(id)) ?? current
  const card = expenseCard(updated as ExpenseView, "Pengeluaran berhasil direvisi")
  // Status anggaran ikut dihitung ulang karena nominal/kategori bisa berubah.
  const budget = await getCategoryBudgetStatus(ctx.session, updated.category_id, year, month)
  card.fields.push(...budgetFields(budget))
  card.footer = revisiHint(card.id)
  return { ok: true, card, message: card.title }
}

// ── Revisi pemasukan ──────────────────────────────────────────────────────────

export async function reviseIncome(
  ctx: RevisionCtx,
  code: string,
  patch: RevisionPatch,
): Promise<RevisionOutcome> {
  const id = await findIncomeId(ctx.session.userId, code.trim())
  if (!id) {
    return {
      ok: false,
      message: `Transaksi "${code}" tidak ditemukan. Cek kode di riwayat (/riwayat) lalu ulangi.`,
    }
  }

  const current = await loadIncomeView(id)
  if (!current) return { ok: false, message: "Data transaksi tidak bisa dibaca." }

  const errors: RevisionFieldError[] = []
  let amount = Number(current.amount)
  let name = current.name
  let date = current.date
  // Field yang tidak di-revisi harus dipertahankan, bukan dikosongkan.
  let categoryId: string | null = current.category_id
  let walletId: string | null = current.wallet_id

  if (patch.amount !== undefined) {
    const parsed = parseAmountLoose(patch.amount)
    if (parsed === null) errors.push({ field: "jumlah", message: `Nominal "${patch.amount}" tidak bisa dibaca` })
    else amount = parsed
  }
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim()
    if (!trimmed) errors.push({ field: "nama", message: "Nama tidak boleh kosong" })
    else name = trimmed
  }
  if (patch.date !== undefined) {
    const trimmed = patch.date.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      errors.push({ field: "tanggal", message: "Tanggal harus format YYYY-MM-DD (contoh: 2026-11-02)" })
    } else {
      date = trimmed
    }
  }
  if (patch.category !== undefined) {
    const raw = patch.category.trim()
    const byId = await db.prepare(
      "SELECT id FROM income_categories WHERE household_id = ? AND id = ?"
    ).get(ctx.householdId, raw) as { id: string } | undefined
    const byName = byId
      ? undefined
      : await db.prepare(
          "SELECT id FROM income_categories WHERE household_id = ? AND lower(name) = lower(?)"
        ).get(ctx.householdId, raw) as { id: string } | undefined
    if (!byId && !byName) errors.push({ field: "kategori", message: `Kategori "${raw}" tidak ditemukan` })
    else categoryId = (byId ?? byName)!.id
  }
  if (patch.wallet !== undefined) {
    const raw = patch.wallet.trim()
    const byId = await db.prepare(
      "SELECT id FROM wallets WHERE user_id = ? AND id = ?"
    ).get(ctx.session.userId, raw) as { id: string } | undefined
    const byName = byId
      ? undefined
      : await db.prepare(
          "SELECT id FROM wallets WHERE user_id = ? AND is_active = 1 AND lower(name) = lower(?)"
        ).get(ctx.session.userId, raw) as { id: string } | undefined
    if (!byId && !byName) errors.push({ field: "wallet", message: `Dompet "${raw}" tidak ditemukan` })
    else walletId = (byId ?? byName)!.id
  }

  if (errors.length > 0) {
    return {
      ok: false,
      message: errors.map((e) => `• ${e.field}: ${e.message}`).join("\n"),
    }
  }

  const { month, year } = monthYear(date)
  try {
    await expenseService.updateIncome(ctx.session, id, {
      name,
      amount,
      date,
      month,
      year,
      is_initial: false,
      wallet_id: walletId,
      category_id: categoryId,
    })
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Gagal menyimpan revisi" }
  }

  const updated = (await loadIncomeView(id)) ?? current
  const card = incomeCard(updated as IncomeView, "Pendapatan berhasil direvisi")
  card.footer = revisiHint(card.id)
  return { ok: true, card, message: card.title }
}

// ── Menampilkan data transaksi (untuk /revisi tanpa field) ────────────────────

export async function showTransaction(
  ctx: RevisionCtx,
  code: string,
): Promise<RevisionOutcome> {
  const expenseId = await findExpenseId(ctx.session.userId, code.trim())
  if (expenseId) {
    const view = await loadExpenseView(expenseId)
    if (view) {
      const card = expenseCard(view, "Data pengeluaran saat ini")
      const { month, year } = monthYear(view.date)
      const budget = await getCategoryBudgetStatus(ctx.session, view.category_id, year, month)
      card.fields.push(...budgetFields(budget))
      card.footer = revisiHint(card.id)
      return { ok: true, card, message: card.title }
    }
  }

  const incomeId = await findIncomeId(ctx.session.userId, code.trim())
  if (incomeId) {
    const view = await loadIncomeView(incomeId)
    if (view) {
      const card = incomeCard(view, "Data pendapatan saat ini")
      card.footer = revisiHint(card.id)
      return { ok: true, card, message: card.title }
    }
  }

  return {
    ok: false,
    message: `Transaksi "${code}" tidak ditemukan. Lihat daftar kode dengan /riwayat.`,
  }
}

/** Ketik transaksi: cari apakah kode tersebut pengeluaran atau pendapatan. */
export async function findTransactionKind(
  userId: string,
  code: string,
): Promise<"expense" | "income" | null> {
  if (await findExpenseId(userId, code.trim())) return "expense"
  if (await findIncomeId(userId, code.trim())) return "income"
  return null
}

// ── Hapus transaksi (untuk /hapus) ───────────────────────────────────────────

/** Tampilkan transaksi yang akan dihapus (langkah konfirmasi). */
export async function previewDeletion(ctx: RevisionCtx, code: string): Promise<RevisionOutcome> {
  const expenseId = await findExpenseId(ctx.session.userId, code.trim())
  if (expenseId) {
    const view = await loadExpenseView(expenseId)
    if (view) {
      const card = expenseCard(view, "Pengeluaran ini akan dihapus")
      card.footer = undefined
      return { ok: true, card, message: card.title }
    }
  }
  const incomeId = await findIncomeId(ctx.session.userId, code.trim())
  if (incomeId) {
    const view = await loadIncomeView(incomeId)
    if (view) {
      const card = incomeCard(view, "Pendapatan ini akan dihapus")
      card.footer = undefined
      return { ok: true, card, message: card.title }
    }
  }
  return {
    ok: false,
    message: `Transaksi "${code}" tidak ditemukan. Lihat daftar kode dengan /riwayat.`,
  }
}

/** Hapus transaksi (pengeluaran atau pendapatan) milik user berdasarkan kode. */
export async function deleteTransactionByCode(
  ctx: RevisionCtx,
  code: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const expenseId = await findExpenseId(ctx.session.userId, code.trim())
  if (expenseId) {
    const view = await loadExpenseView(expenseId)
    try {
      await expenseService.deleteExpense(ctx.session, expenseId)
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Gagal menghapus transaksi" }
    }
    return {
      ok: true,
      message: `Pengeluaran "${view?.name ?? code}" (${shortCode(expenseId)}) berhasil dihapus.`,
    }
  }

  const incomeId = await findIncomeId(ctx.session.userId, code.trim())
  if (incomeId) {
    const view = await loadIncomeView(incomeId)
    try {
      await expenseService.deleteIncome(ctx.session, incomeId)
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Gagal menghapus transaksi" }
    }
    return {
      ok: true,
      message: `Pendapatan "${view?.name ?? code}" (${shortCode(incomeId)}) berhasil dihapus.`,
    }
  }

  return {
    ok: false,
    message: `Transaksi "${code}" tidak ditemukan. Lihat daftar kode dengan /riwayat.`,
  }
}

// ── Daftar transaksi terbaru (untuk /riwayat) ────────────────────────────────

export interface HistoryRow {
  id: string
  date: string
  name: string
  amount: number
  kind: string
}

export async function listRecent(userId: string, limit = 10): Promise<HistoryRow[]> {
  return await db.prepare(
    `SELECT id, date, name, amount, kind FROM (
       SELECT id, date, name, amount, 'pengeluaran' AS kind FROM expenses WHERE user_id = ?
       UNION ALL
       SELECT id, date, name, amount, 'pendapatan' AS kind FROM incomes WHERE user_id = ?
     ) t ORDER BY date DESC, id DESC LIMIT ?`
  ).all(userId, userId, limit) as HistoryRow[]
}

/** Ringkasan singkat untuk pesan bantuan. */
export function revisionHelpText(): string {
  return [
    "<b>Perintah revisi</b>",
    "",
    "<code>/revisi</code> — lihat daftar kode transaksi terbaru",
    "<code>/revisi &lt;kode&gt;</code> — tampilkan data transaksi",
    "<code>/revisi &lt;kode&gt; &lt;field&gt; &lt;nilai&gt;</code> — ubah satu field",
    "",
    "Field yang bisa diubah:",
    "• <code>jumlah</code> — mis. <code>/revisi 0AD968 jumlah 30rb</code>",
    "• <code>nama</code> — mis. <code>/revisi 0AD968 nama makan malam</code>",
    "• <code>tanggal</code> — mis. <code>/revisi 0AD968 tanggal 2026-11-01</code>",
    "• <code>kategori</code> — mis. <code>/revisi 0AD968 kategori TRANSPORTASI</code>",
    "• <code>wallet</code> — mis. <code>/revisi 0AD968 wallet BCA</code>",
    "• <code>kebutuhan</code> — <code>PRIMER</code> / <code>SEKUNDER</code> / <code>TERSIER</code>",
    "• <code>keluarga</code> — <code>Y</code> / <code>N</code>",
    "",
    "Kode = 6 karakter terakhir ID transaksi (lihat di /riwayat atau di pesan pencatatan).",
  ].join("\n")
}

export { formatAmount, orDash, shortCode }
