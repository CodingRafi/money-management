import { z } from "zod"
import { db } from "@/lib/db"
import type { SessionData } from "@/lib/auth-simple"
import { expenseService } from "@/services/expense.service"
import { financeService } from "@/services/finance.service"
import type { GeminiSchema, GeminiTool } from "./gemini"
import type { TxnCard } from "./format"
import {
  expenseCard,
  incomeCard,
  investmentCard,
  investmentTxCard,
  loanCard,
  loanPaymentCard,
  loadExpenseView,
  loadIncomeView,
  transferCard,
} from "./cards"
import { REVISI_HINT } from "./format"
import { reviseExpense, reviseIncome } from "./revision"

// ── Konteks eksekusi ─────────────────────────────────────────────────────────

export interface ToolContext {
  session: SessionData
  householdId: string
  /**
   * Tanggal "hari ini" menurut jam database (WIB). Tanggal pencatatan juga
   * berasal dari Postgres, jadi sumber kebenarannya sama dan tidak meleset
   * walaupun jam server berbeda.
   */
  today: string
}

export interface ToolResult {
  ok: boolean
  /** Ringkasan singkat untuk AI (dipakai menyusun pesan balasan ke pengguna). */
  message: string
  data?: Record<string, unknown>
  /**
   * Kartu terstruktur (kalau ada). Kartu inilah yang dikirim ke user, bukan
   * kalimat bebas dari AI — supaya format konsisten & mudah direvisi.
   */
  card?: TxnCard
}

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

/** Tanggal hari ini versi jam database (WIB), mis. "2026-11-02". */
export async function todayFromDb(): Promise<string> {
  const row = await db.prepare(
    "SELECT to_char(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS today"
  ).get() as { today: string } | undefined
  return row?.today ?? new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function monthYear(date: string): { month: number; year: number } {
  const [y, m] = date.split("-").map(Number)
  return { month: m, year: y }
}
// ── Skema argumen (zod) ──────────────────────────────────────────────────────

const idSchema = (desc: string) => z.string().trim().min(1, desc)
const amountSchema = z.coerce.number().positive("Nominal harus lebih dari 0").finite()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus format YYYY-MM-DD")

const expenseArgs = z.object({
  name: z.string().trim().min(1).max(200),
  amount: amountSchema,
  date: dateSchema.optional(),
  category_id: idSchema("ID kategori pengeluaran").optional(),
  category_name: z.string().trim().optional(),
  wallet_id: idSchema("ID dompet").optional(),
  wallet_name: z.string().trim().optional(),
  needs_type: z.enum(["PRIMER", "SEKUNDER", "TERSIER"]).optional(),
  is_family_expense: z.boolean().optional(),
})

const incomeArgs = z.object({
  name: z.string().trim().min(1).max(200),
  amount: amountSchema,
  date: dateSchema.optional(),
  category_id: idSchema("ID kategori pemasukan").optional(),
  category_name: z.string().trim().optional(),
  wallet_id: idSchema("ID dompet").optional(),
  wallet_name: z.string().trim().optional(),
})

const transferArgs = z.object({
  from_wallet_id: idSchema("ID dompet asal").optional(),
  from_wallet_name: z.string().trim().optional(),
  to_wallet_id: idSchema("ID dompet tujuan").optional(),
  to_wallet_name: z.string().trim().optional(),
  amount: amountSchema,
  date: dateSchema.optional(),
  notes: z.string().trim().optional(),
})

const loanArgs = z.object({
  type: z.enum(["PIUTANG", "HUTANG"]),
  name: z.string().trim().min(1).max(200),
  principal_amount: amountSchema,
  wallet_id: idSchema("ID dompet").optional(),
  wallet_name: z.string().trim().optional(),
  interest_rate: z.coerce.number().min(0).optional(),
  interest_type: z.enum(["FLAT", "REDUCING"]).optional(),
  start_date: dateSchema.optional(),
  due_date: dateSchema.optional(),
  description: z.string().trim().optional(),
})

const loanPaymentArgs = z.object({
  loan_id: idSchema("ID pinjaman"),
  principal_paid: amountSchema,
  date: dateSchema.optional(),
  notes: z.string().trim().optional(),
})

const investmentArgs = z.object({
  name: z.string().trim().min(1).max(200),
  category_id: idSchema("ID kategori investasi").optional(),
  category_name: z.string().trim().optional(),
  wallet_id: idSchema("ID dompet").optional(),
  unit: z.string().trim().optional(),
  notes: z.string().trim().optional(),
})

const investmentTxArgs = z.object({
  investment_id: idSchema("ID aset investasi"),
  type: z.enum(["BUY", "SELL", "DIVIDEND"]),
  total_amount: amountSchema,
  date: dateSchema.optional(),
  quantity: z.string().trim().optional(),
  goal_id: idSchema("ID kantong investasi").optional(),
  from_wallet_id: idSchema("ID dompet asal").optional(),
  to_wallet_id: idSchema("ID dompet tujuan").optional(),
  notes: z.string().trim().optional(),
})

const summaryArgs = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

const deleteArgs = z.object({
  id: idSchema("ID transaksi"),
  name: z.string().trim().optional(),
})

const revisionArgs = z.object({
  code: z.string().trim().min(1, "Kode transaksi wajib diisi"),
  amount: z.string().trim().optional(),
  name: z.string().trim().optional(),
  date: z.string().trim().optional(),
  category: z.string().trim().optional(),
  wallet: z.string().trim().optional(),
  needs_type: z.enum(["PRIMER", "SEKUNDER", "TERSIER"]).optional(),
  is_family_expense: z.boolean().optional(),
})

// ── Helper resolusi nama → id ────────────────────────────────────────────────

async function resolveExpenseCategory(ctx: ToolContext, id?: string, name?: string) {
  if (id) return id
  if (!name) return null
  const rows = await db.prepare(
    `SELECT id, name FROM expense_categories
     WHERE household_id = ? AND is_hidden = 0 AND LOWER(name) = LOWER(?)`
  ).all(ctx.householdId, name) as { id: string; name: string }[]
  return rows[0]?.id ?? null
}

async function resolveIncomeCategory(ctx: ToolContext, id?: string, name?: string) {
  if (id) return id
  if (!name) return null
  const rows = await db.prepare(
    `SELECT id, name FROM income_categories
     WHERE household_id = ? AND is_hidden = 0 AND LOWER(name) = LOWER(?)`
  ).all(ctx.householdId, name) as { id: string; name: string }[]
  return rows[0]?.id ?? null
}

async function resolveWallet(ctx: ToolContext, id?: string, name?: string) {
  if (id) return id
  if (!name) return null
  const rows = await db.prepare(
    "SELECT id, name FROM wallets WHERE user_id = ? AND is_active = 1 AND LOWER(name) = LOWER(?)"
  ).all(ctx.session.userId, name) as { id: string; name: string }[]
  return rows[0]?.id ?? null
}

async function resolveInvestmentCategory(id?: string, name?: string) {
  if (id) return id
  if (!name) return null
  const rows = await db.prepare(
    "SELECT id, name FROM investment_categories WHERE LOWER(name) = LOWER(?)"
  ).all(name) as { id: string; name: string }[]
  return rows[0]?.id ?? null
}

// ── Definisi tool untuk Gemini ──────────────────────────────────────────────

const S = (description: string): GeminiSchema => ({ type: "STRING", description })
const N = (description: string): GeminiSchema => ({ type: "NUMBER", description })
const I = (description: string): GeminiSchema => ({ type: "INTEGER", description })
const B = (description: string): GeminiSchema => ({ type: "BOOLEAN", description })
const OBJ = (properties: Record<string, GeminiSchema>, required: string[] = []): GeminiSchema => ({
  type: "OBJECT",
  properties,
  required,
})

export const telegramTool: GeminiTool = {
  functionDeclarations: [
    {
      name: "list_wallets",
      description: "Daftar dompet milik pengguna yang aktif (dengan id, nama, dan jenis cair/non-cair). Panggil sebelum mencatat transaksi yang menyebut nama dompet.",
      parameters: OBJ({}),
    },
    {
      name: "list_expense_categories",
      description: "Daftar kategori pengeluaran milik keluarga beserta id, nama, dan jenis kebutuhannya (Primer/Sekunder/Tersier).",
      parameters: OBJ({}),
    },
    {
      name: "list_income_categories",
      description: "Daftar kategori pemasukan milik keluarga beserta id dan nama.",
      parameters: OBJ({}),
    },
    {
      name: "list_expense_types",
      description: "Daftar jenis pengeluaran (TETAP / FLEKSIBEL) milik keluarga beserta id dan nama.",
      parameters: OBJ({}),
    },
    {
      name: "list_investment_categories",
      description: "Daftar kategori aset investasi (SAHAM, REKSA DANA, EMAS, KRIPTO, ...) beserta id dan nama.",
      parameters: OBJ({}),
    },
    {
      name: "list_investments",
      description: "Daftar aset investasi milik pengguna yang aktif beserta id, nama, kategori, dan satuan.",
      parameters: OBJ({}),
    },
    {
      name: "list_investment_goals",
      description: "Daftar kantong/goal investasi milik pengguna beserta id, nama, dan target nominal.",
      parameters: OBJ({}),
    },
    {
      name: "list_loans",
      description: "Daftar pinjaman milik pengguna (piutang/hutang) beserta id, nama, tipe, sisa pokok, dan status.",
      parameters: OBJ({}),
    },
    {
      name: "create_expense",
      description: "Mencatat pengeluaran. Gunakan hanya setelah pengguna relayed nominal & kategori dengan jelas. Tanggal default hari ini.",
      parameters: OBJ(
        {
          name: S("Nama/deskripsi singkat pengeluaran, mis. 'Makan siang'"),
          amount: N("Nominal dalam rupiah, mis. 25000"),
          date: S("Tanggal transaksi format YYYY-MM-DD. Kosongkan untuk hari ini"),
          category_id: S("ID kategori pengeluaran. Kosongkan bila tidak ada"),
          category_name: S("Nama kategori pengeluaran bila id tidak diketahui"),
          wallet_id: S("ID dompet. Kosongkan bila tidak ada"),
          wallet_name: S("Nama dompet bila id tidak diketahui"),
          needs_type: {
            type: "STRING",
            description: "Kebutuhan: PRIMER (primer/necessary), SEKUNDER (sekunder), TERSIER (tersier/hiburan). Default PRIMER",
            enum: ["PRIMER", "SEKUNDER", "TERSIER"],
          },
          is_family_expense: B("True bila pengeluaran ini untuk kebutuhan rumah tangga bersama"),
        },
        ["name", "amount"],
      ),
    },
    {
      name: "create_income",
      description: "Mencatat pemasukan (gaji, bonus, freelance, dll). Tanggal default hari ini.",
      parameters: OBJ(
        {
          name: S("Nama/deskripsi singkat pemasukan"),
          amount: N("Nominal dalam rupiah"),
          date: S("Tanggal transaksi format YYYY-MM-DD. Kosongkan untuk hari ini"),
          category_id: S("ID kategori pemasukan"),
          category_name: S("Nama kategori pemasukan bila id tidak diketahui"),
          wallet_id: S("ID dompet"),
          wallet_name: S("Nama dompet bila id tidak diketahui"),
        },
        ["name", "amount"],
      ),
    },
    {
      name: "create_transfer",
      description: "Mencatat perpindahan uang antar dompet milik pengguna (bukan pengeluaran).",
      parameters: OBJ(
        {
          from_wallet_id: S("ID dompet asal"),
          from_wallet_name: S("Nama dompet asal bila id tidak diketahui"),
          to_wallet_id: S("ID dompet tujuan"),
          to_wallet_name: S("Nama dompet tujuan bila id tidak diketahui"),
          amount: N("Nominal dalam rupiah"),
          date: S("Tanggal format YYYY-MM-DD. Kosongkan untuk hari ini"),
          notes: S("Catatan singkat"),
        },
        ["amount"],
      ),
    },
    {
      name: "create_loan",
      description: "Mencatat pinjaman: PIUTANG (user loaned out / uang dipinjam orang lain) atau HUTANG (user borrowed / uang dipinjam dari orang lain).",
      parameters: OBJ(
        {
          type: { type: "STRING", description: "PIUTANG atau HUTANG", enum: ["PIUTANG", "HUTANG"] },
          name: S("Nama pinjaman, mis. 'Pinjaman Budi' atau 'Kredit motor'"),
          principal_amount: N("Pokok pinjaman dalam rupiah"),
          wallet_id: S("ID dompet tempat dana masuk/keluar"),
          wallet_name: S("Nama dompet bila id tidak diketahui"),
          interest_rate: N("Bunga dalam persen per periode, mis. 1.5. Default 0"),
          interest_type: { type: "STRING", description: "FLAT atau REDUCING", enum: ["FLAT", "REDUCING"] },
          start_date: S("Tanggal mulai format YYYY-MM-DD. Default hari ini"),
          due_date: S("Tanggal jatuh tempo format YYYY-MM-DD"),
          description: S("Keterangan tambahan"),
        },
        ["type", "name", "principal_amount"],
      ),
    },
    {
      name: "add_loan_payment",
      description: "Mencatat cicilan pembayaran sebuah pinjaman. Bunga dihitung otomatis oleh sistem.",
      parameters: OBJ(
        {
          loan_id: S("ID pinjaman"),
          principal_paid: N("Pokok yang dibayar dalam rupiah"),
          date: S("Tanggal bayar format YYYY-MM-DD. Default hari ini"),
          notes: S("Catatan singkat"),
        },
        ["loan_id", "principal_paid"],
      ),
    },
    {
      name: "create_investment",
      description: "Mendaftarkan aset investasi baru milik pengguna.",
      parameters: OBJ(
        {
          name: S("Nama aset, mis. 'Saham BBCA'"),
          category_id: S("ID kategori investasi"),
          category_name: S("Nama kategori investasi bila id tidak diketahui"),
          wallet_id: S("ID dompet tempat aset disimpan"),
          unit: S("Satuan, mis. lot, unit, gram"),
          notes: S("Catatan"),
        },
        ["name"],
      ),
    },
    {
      name: "create_investment_transaction",
      description: "Mencatat transaksi investasi pada aset yang sudah ada: BUY (beli), SELL (jual), DIVIDEND (dividen/bunga).",
      parameters: OBJ(
        {
          investment_id: S("ID aset investasi"),
          type: { type: "STRING", description: "BUY, SELL, atau DIVIDEND", enum: ["BUY", "SELL", "DIVIDEND"] },
          total_amount: N("Nilai transaksi total dalam rupiah"),
          date: S("Tanggal format YYYY-MM-DD. Default hari ini"),
          quantity: S("Jumlah unit, mis. '2' atau '0.5'. Default 1"),
          goal_id: S("ID kantong investasi. Wajib untuk BUY"),
          from_wallet_id: S("ID dompet asal. Wajib untuk BUY"),
          to_wallet_id: S("ID dompet tujuan. Wajib untuk SELL dan DIVIDEND"),
          notes: S("Catatan"),
        },
        ["investment_id", "type", "total_amount"],
      ),
    },
    {
      name: "get_summary",
      description: "Ringkasan keuangan: total pemasukan, total pengeluaran, sisa budget, dan rincian per kategori.",
      parameters: OBJ({
        month: I("Bulan 1-12. Kosongkan untuk bulan berjalan"),
        year: I("Tahun, mis. 2026. Kosongkan untuk tahun berjalan"),
      }),
    },
    {
      name: "list_recent_transactions",
      description: "Daftar transaksi terakhir (pengeluaran & pemasukan) milik pengguna, untuk koreksi atau konfirmasi.",
      parameters: OBJ({
        limit: I("Jumlah transaksi, default 10, maksimal 50"),
        type: { type: "STRING", description: "expense, income, atau all", enum: ["expense", "income", "all"] },
      }),
    },
    {
      name: "delete_expense",
      description: "Menghapus satu pengeluaran yang tercatat. Gunakan HANYA jika pengguna meminta menghapus/membatalkan transaksi tertentu.",
      parameters: OBJ({ id: S("ID pengeluaran"), name: S("Nama transaksi bila:id tidak diketahui") }, ["id"]),
    },
    {
      name: "delete_income",
      description: "Menghapus satu pemasukan yang tercatat. Gunakan HANYA jika pengguna meminta menghapus/membatalkan transaksi tertentu.",
      parameters: OBJ({ id: S("ID pemasukan"), name: S("Nama transaksi bila id tidak diketahui") }, ["id"]),
    },
    {
      name: "revise_expense",
      description:
        "Memperbaiki pengeluaran yang sudah tercatat (nominal, nama, tanggal, kategori, dompet, jenis kebutuhan, atau flag keluarga). Gunakan kode 6 karakter dari pesan pencatatan atau /riwayat.",
      parameters: OBJ(
        {
          code: S("Kode revisi (6 karakter) atau ID penuh transaksi"),
          amount: S("Nominal baru, mis. '30rb'"),
          name: S("Nama/keterangan baru"),
          date: S("Tanggal baru format YYYY-MM-DD"),
          category: S("Nama kategori baru"),
          wallet: S("Nama dompet baru"),
          needs_type: { type: "STRING", description: "PRIMER, SEKUNDER, atau TERSIER", enum: ["PRIMER", "SEKUNDER", "TERSIER"] },
          is_family_expense: B("True bila dicatat sebagai pengeluaran keluarga"),
        },
        ["code"],
      ),
    },
    {
      name: "revise_income",
      description:
        "Memperbaiki pemasukan yang sudah tercatat (nominal, nama, tanggal, kategori, atau dompet). Gunakan kode 6 karakter dari pesan pencatatan atau /riwayat.",
      parameters: OBJ(
        {
          code: S("Kode revisi (6 karakter) atau ID penuh transaksi"),
          amount: S("Nominal baru, mis. '30rb'"),
          name: S("Nama/keterangan baru"),
          date: S("Tanggal baru format YYYY-MM-DD"),
          category: S("Nama kategori baru"),
          wallet: S("Nama dompet baru"),
        },
        ["code"],
      ),
    },
  ],
}

// ── Eksekutor tool ───────────────────────────────────────────────────────────

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>

const handlers: Record<string, Handler> = {
  async list_wallets(_args, ctx) {
    const rows = await db.prepare(
      "SELECT id, name, is_liquid FROM wallets WHERE user_id = ? AND is_active = 1 ORDER BY sort_order, name"
    ).all(ctx.session.userId) as { id: string; name: string; is_liquid: number }[]
    return {
      ok: true,
      message: `${rows.length} dompet aktif.`,
      data: { wallets: rows.map((r) => ({ id: r.id, name: r.name, is_liquid: !!r.is_liquid })) },
    }
  },

  async list_expense_categories(_args, ctx) {
    const rows = await db.prepare(
      `SELECT ec.id, ec.name, ec.type_id, et.name AS type_name
       FROM expense_categories ec
       JOIN expense_types et ON et.id = ec.type_id
       WHERE ec.household_id = ? AND ec.is_hidden = 0
       ORDER BY et.sort_order, ec.sort_order`
    ).all(ctx.householdId) as { id: string; name: string; type_id: string; type_name: string }[]
    return {
      ok: true,
      message: `${rows.length} kategori pengeluaran.`,
      data: { categories: rows.map((r) => ({ id: r.id, name: r.name, type_name: r.type_name })) },
    }
  },

  async list_income_categories(_args, ctx) {
    const rows = await db.prepare(
      "SELECT id, name FROM income_categories WHERE household_id = ? AND is_hidden = 0 ORDER BY sort_order, name"
    ).all(ctx.householdId) as { id: string; name: string }[]
    return {
      ok: true,
      message: `${rows.length} kategori pemasukan.`,
      data: { categories: rows.map((r) => ({ id: r.id, name: r.name })) },
    }
  },

  async list_expense_types(_args, ctx) {
    const rows = await db.prepare(
      "SELECT id, name FROM expense_types WHERE household_id = ? ORDER BY sort_order, name"
    ).all(ctx.householdId) as { id: string; name: string }[]
    return { ok: true, message: `${rows.length} jenis pengeluaran.`, data: { types: rows } }
  },

  async list_investment_categories() {
    const rows = await db.prepare(
      "SELECT id, name FROM investment_categories ORDER BY sort_order, name"
    ).all() as { id: string; name: string }[]
    return { ok: true, message: `${rows.length} kategori investasi.`, data: { categories: rows } }
  },

  async list_investments(_args, ctx) {
    const rows = await db.prepare(
      `SELECT i.id, i.name, i.unit, i.is_closed, ic.name AS category_name
       FROM investments i
       JOIN investment_categories ic ON ic.id = i.category_id
       WHERE i.user_id = ? AND i.is_active = 1
       ORDER BY i.created_at DESC, i.name`
    ).all(ctx.session.userId) as {
      id: string; name: string; unit: string | null; is_closed: number; category_name: string
    }[]
    return {
      ok: true,
      message: `${rows.length} aset investasi.`,
      data: {
        investments: rows.map((r) => ({
          id: r.id, name: r.name, unit: r.unit, category: r.category_name, is_closed: !!r.is_closed,
        })),
      },
    }
  },

  async list_investment_goals(_args, ctx) {
    const rows = await db.prepare(
      "SELECT id, name, target_amount FROM investment_goals WHERE user_id = ? AND is_active = 1 ORDER BY sort_order, name"
    ).all(ctx.session.userId) as { id: string; name: string; target_amount: number | null }[]
    return {
      ok: true,
      message: `${rows.length} kantong investasi.`,
      data: { goals: rows.map((r) => ({ id: r.id, name: r.name, target_amount: r.target_amount })) },
    }
  },

  async list_loans(_args, ctx) {
    const rows = await db.prepare(
      `SELECT l.id, l.name, l.type, l.principal_amount, l.status, l.due_date,
              COALESCE((SELECT SUM(principal_paid) FROM loan_payments p WHERE p.loan_id = l.id), 0) AS paid
       FROM loans l
       WHERE l.user_id = ? AND l.is_active = 1
       ORDER BY l.created_at DESC`
    ).all(ctx.session.userId) as {
      id: string; name: string; type: string; principal_amount: number
      status: string; due_date: string | null; paid: number
    }[]
    return {
      ok: true,
      message: `${rows.length} pinjaman aktif.`,
      data: {
        loans: rows.map((r) => ({
          id: r.id, name: r.name, type: r.type, status: r.status, due_date: r.due_date,
          principal_amount: r.principal_amount, remaining: r.principal_amount - Number(r.paid),
        })),
      },
    }
  },

  async create_expense(raw, ctx) {
    const a = expenseArgs.parse(raw)
    const date = a.date ?? ctx.today
    const { month, year } = monthYear(date)
    const categoryId = await resolveExpenseCategory(ctx, a.category_id, a.category_name)
    const walletId = await resolveWallet(ctx, a.wallet_id, a.wallet_name)

    const id = await expenseService.createExpense(ctx.session, {
      name: a.name,
      amount: a.amount,
      date,
      month,
      year,
      is_initial: false,
      wallet_id: walletId,
      category_id: categoryId,
      needs_type: a.needs_type ?? "PRIMER",
      is_family_expense: a.is_family_expense ?? false,
    })

    const view = await loadExpenseView(id)
    const card = view ? expenseCard(view) : null
    if (card) card.footer = REVISI_HINT

    return {
      ok: true,
      message: card?.title ?? `Pengeluaran "${a.name}" ${fmt(a.amount)} tanggal ${date} berhasil dicatat.`,
      data: { id, name: a.name, amount: a.amount, date, month, year },
      card: card ?? undefined,
    }
  },

  async create_income(raw, ctx) {
    const a = incomeArgs.parse(raw)
    const date = a.date ?? ctx.today
    const { month, year } = monthYear(date)
    const categoryId = await resolveIncomeCategory(ctx, a.category_id, a.category_name)
    const walletId = await resolveWallet(ctx, a.wallet_id, a.wallet_name)

    const id = await expenseService.createIncome(ctx.session, {
      name: a.name,
      amount: a.amount,
      date,
      month,
      year,
      is_initial: false,
      wallet_id: walletId,
      category_id: categoryId,
    })

    const view = await loadIncomeView(id)
    const card = view ? incomeCard(view) : null
    if (card) card.footer = REVISI_HINT

    return {
      ok: true,
      message: card?.title ?? `Pemasukan "${a.name}" ${fmt(a.amount)} tanggal ${date} berhasil dicatat.`,
      data: { id, name: a.name, amount: a.amount, date, month, year },
      card: card ?? undefined,
    }
  },

  async create_transfer(raw, ctx) {
    const a = transferArgs.parse(raw)
    const date = a.date ?? ctx.today
    const { month, year } = monthYear(date)
    const fromId = await resolveWallet(ctx, a.from_wallet_id, a.from_wallet_name)
    const toId = await resolveWallet(ctx, a.to_wallet_id, a.to_wallet_name)
    if (!fromId || !toId) throw new Error("Dompet asal/tujuan belum bisa dikenali. Panggil list_wallets dulu.")

    const id = await financeService.createTransfer(ctx.session.userId, {
      fromWalletId: fromId,
      toWalletId: toId,
      amount: a.amount,
      date,
      notes: a.notes ?? null,
      month,
      year,
    })

    const names = await db.prepare(
      `SELECT
         (SELECT name FROM wallets WHERE id = ?) AS from_wallet_name,
         (SELECT name FROM wallets WHERE id = ?) AS to_wallet_name`
    ).get(fromId, toId) as { from_wallet_name: string | null; to_wallet_name: string | null }

    const card = transferCard({
      id, date, amount: a.amount,
      from_wallet_name: names.from_wallet_name,
      to_wallet_name: names.to_wallet_name,
      notes: a.notes ?? null,
    })

    return {
      ok: true,
      message: card.title,
      data: { id, amount: a.amount, date, from_wallet_id: fromId, to_wallet_id: toId },
      card,
    }
  },

  async create_loan(raw, ctx) {
    const a = loanArgs.parse(raw)
    const startDate = a.start_date ?? ctx.today
    const walletId = await resolveWallet(ctx, a.wallet_id, a.wallet_name)
    if (!walletId) throw new Error("Dompet wajib diisi. Panggil list_wallets dulu.")

    const id = await financeService.createLoan(ctx.session.userId, {
      type: a.type,
      name: a.name,
      description: a.description ?? null,
      principalAmount: a.principal_amount,
      interestRate: a.interest_rate ?? 0,
      interestType: a.interest_type ?? "FLAT",
      startDate,
      dueDate: a.due_date ?? null,
      walletId,
    })

    const row = await db.prepare(
      `SELECT l.name, l.type, l.principal_amount, l.interest_rate, l.start_date, l.due_date,
              w.name AS wallet_name
       FROM loans l LEFT JOIN wallets w ON w.id = l.wallet_id
       WHERE l.id = ?`
    ).get(id) as {
      name: string; type: string; principal_amount: number; interest_rate: number
      start_date: string; due_date: string | null; wallet_name: string | null
    } | undefined

    const card = row
      ? loanCard({
          id, name: row.name, type: row.type, principal_amount: row.principal_amount,
          interest_rate: row.interest_rate, start_date: row.start_date,
          due_date: row.due_date, wallet_name: row.wallet_name,
        })
      : null

    return {
      ok: true,
      message: card?.title ?? `Pinjaman "${a.name}" ${fmt(a.principal_amount)} berhasil dicatat.`,
      data: { id, name: a.name, type: a.type, principal_amount: a.principal_amount },
      card: card ?? undefined,
    }
  },

  async add_loan_payment(raw, ctx) {
    const a = loanPaymentArgs.parse(raw)
    const date = a.date ?? ctx.today
    const paymentId = await financeService.addLoanPayment(ctx.session.userId, a.loan_id, {
      principalPaid: a.principal_paid,
      date,
      notes: a.notes ?? null,
    })

    const row = await db.prepare(
      `SELECT p.principal_paid, p.interest_paid, p.total_paid, p.date, p.notes, l.name AS loan_name
       FROM loan_payments p JOIN loans l ON l.id = p.loan_id
       WHERE p.id = ?`
    ).get(paymentId) as {
      principal_paid: number; interest_paid: number; total_paid: number
      date: string; notes: string | null; loan_name: string
    } | undefined

    const card = row
      ? loanPaymentCard({
          id: paymentId, loan_name: row.loan_name, principal_paid: row.principal_paid,
          interest_paid: row.interest_paid, total_paid: row.total_paid,
          date: row.date, notes: row.notes,
        })
      : null

    return {
      ok: true,
      message: card?.title ?? `Cicilan ${fmt(a.principal_paid)} tanggal ${date} berhasil dicatat.`,
      data: { id: paymentId, loan_id: a.loan_id, principal_paid: a.principal_paid, date },
      card: card ?? undefined,
    }
  },

  async create_investment(raw, ctx) {
    const a = investmentArgs.parse(raw)
    const categoryId = await resolveInvestmentCategory(a.category_id, a.category_name)
    if (!categoryId) throw new Error("Kategori investasi belum bisa dikenali. Panggil list_investment_categories dulu.")
    const walletId = await resolveWallet(ctx, a.wallet_id, undefined)

    const id = await financeService.createInvestment(ctx.session.userId, {
      name: a.name,
      categoryId,
      walletId,
      unit: a.unit ?? null,
      notes: a.notes ?? null,
    })

    const row = await db.prepare(
      `SELECT i.name, i.unit, ic.name AS category_name, w.name AS wallet_name
       FROM investments i
       LEFT JOIN investment_categories ic ON ic.id = i.category_id
       LEFT JOIN wallets w ON w.id = i.wallet_id
       WHERE i.id = ?`
    ).get(id) as { name: string; unit: string | null; category_name: string | null; wallet_name: string | null } | undefined

    const card = row
      ? investmentCard({
          id, name: row.name, category_name: row.category_name, unit: row.unit, wallet_name: row.wallet_name,
        })
      : null

    return {
      ok: true,
      message: card?.title ?? `Aset investasi "${a.name}" berhasil didaftarkan.`,
      data: { id, name: a.name },
      card: card ?? undefined,
    }
  },

  async create_investment_transaction(raw, ctx) {
    const a = investmentTxArgs.parse(raw)
    const date = a.date ?? ctx.today
    const fromId = await resolveWallet(ctx, a.from_wallet_id, undefined)
    const toId = await resolveWallet(ctx, a.to_wallet_id, undefined)

    const id = await financeService.createInvestmentTransaction(ctx.session.userId, a.investment_id, {
      type: a.type,
      quantity: a.quantity,
      totalAmount: a.total_amount,
      date,
      goalId: a.goal_id ?? null,
      fromWalletId: fromId,
      toWalletId: toId,
      notes: a.notes ?? null,
    })

    const row = await db.prepare(
      `SELECT it.quantity, it.total_amount, it.date, it.notes, it.type,
              i.name AS investment_name, i.unit,
              fw.name AS from_wallet_name, tw.name AS to_wallet_name
       FROM investment_transactions it
       JOIN investments i ON i.id = it.investment_id
       LEFT JOIN wallets fw ON fw.id = it.from_wallet_id
       LEFT JOIN wallets tw ON tw.id = it.to_wallet_id
       WHERE it.id = ?`
    ).get(id) as {
      quantity: string; total_amount: number; date: string; notes: string | null; type: string
      investment_name: string; unit: string | null
      from_wallet_name: string | null; to_wallet_name: string | null
    } | undefined

    const card = row
      ? investmentTxCard({
          id, investment_name: row.investment_name, type: row.type, quantity: row.quantity, unit: row.unit,
          total_amount: row.total_amount, date: row.date,
          from_wallet_name: row.from_wallet_name, to_wallet_name: row.to_wallet_name, notes: row.notes,
        })
      : null

    return {
      ok: true,
      message: card?.title ?? `Transaksi investasi ${a.type} ${fmt(a.total_amount)} tanggal ${date} berhasil dicatat.`,
      data: { id, investment_id: a.investment_id, type: a.type, total_amount: a.total_amount, date },
    }
  },

  async get_summary(raw, ctx) {
    const a = summaryArgs.parse(raw)
    const now = new Date()
    const year = a.year ?? now.getFullYear()
    const month = a.month ?? now.getMonth() + 1

    const income = await db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM incomes WHERE user_id=? AND year=? AND month=? AND is_initial=0"
    ).get(ctx.session.userId, year, month) as { total: number }

    const expense = await db.prepare(
      "SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE user_id=? AND year=? AND month=? AND is_initial=0"
    ).get(ctx.session.userId, year, month) as { total: number }

    const byCategory = await db.prepare(
      `SELECT ic.name AS category, COALESCE(SUM(e.amount),0) AS total
       FROM expenses e LEFT JOIN expense_categories ic ON ic.id = e.category_id
       WHERE e.user_id=? AND e.year=? AND e.month=? AND e.is_initial=0
       GROUP BY ic.name ORDER BY total DESC`
    ).all(ctx.session.userId, year, month) as { category: string | null; total: number }[]

    const budget = await ctx.session.householdId
      ? await db.prepare(
          "SELECT spending_limit FROM household_members WHERE household_id=? AND user_id=?"
        ).get(ctx.session.householdId, ctx.session.userId) as { spending_limit: number | null } | undefined
      : undefined

    const limit = budget?.spending_limit ?? null
    return {
      ok: true,
      message: `Ringkasan ${month}/${year}: pemasukan ${fmt(Number(income.total))}, pengeluaran ${fmt(Number(expense.total))}.`,
      data: {
        year, month,
        income: Number(income.total),
        expense: Number(expense.total),
        spending_limit: limit,
        remaining: limit == null ? null : Math.max(0, limit - Number(expense.total)),
        by_category: byCategory.map((c) => ({ category: c.category ?? "(tanpa kategori)", total: c.total })),
      },
    }
  },

  async list_recent_transactions(raw, ctx) {
    const limit = Math.min(50, Math.max(1, Number(raw.limit ?? 10)))
    const type = String(raw.type ?? "all")
    const rows = await db.prepare(
      `SELECT id, date, name, amount, 'expense' AS kind FROM (
         SELECT id, date, name, amount FROM expenses WHERE user_id = ?
         UNION ALL
         SELECT id, date, name, amount FROM incomes WHERE user_id = ?
       ) t
       ORDER BY date DESC LIMIT ?`
    ).all(ctx.session.userId, ctx.session.userId, limit) as {
      id: string; date: string; name: string; amount: number; kind: string
    }[]
    const filtered = type === "all" ? rows : rows.filter((r) => r.kind === type)
    return {
      ok: true,
      message: `${filtered.length} transaksi terakhir.`,
      data: { transactions: filtered.map((r) => ({ ...r, amount: Number(r.amount) })) },
    }
  },

  async delete_expense(raw, ctx) {
    const a = deleteArgs.parse(raw)
    const changed = await db.prepare(
      "DELETE FROM expenses WHERE id = ? AND user_id = ?"
    ).run(a.id, ctx.session.userId)
    if (!changed.changes) throw new Error("Pengeluaran tidak ditemukan")
    return { ok: true, message: `Pengeluaran "${a.name ?? a.id}" berhasil dihapus.`, data: { id: a.id } }
  },

  async delete_income(raw, ctx) {
    const a = deleteArgs.parse(raw)
    const changed = await db.prepare(
      "DELETE FROM incomes WHERE id = ? AND user_id = ?"
    ).run(a.id, ctx.session.userId)
    if (!changed.changes) throw new Error("Pemasukan tidak ditemukan")
    return { ok: true, message: `Pemasukan "${a.name ?? a.id}" berhasil dihapus.`, data: { id: a.id } }
  },

  async revise_expense(raw, ctx) {
    const a = revisionArgs.parse(raw)
    const outcome = await reviseExpense(ctx, a.code, {
      amount: a.amount,
      name: a.name,
      date: a.date,
      category: a.category,
      wallet: a.wallet,
      needs_type: a.needs_type,
      is_family_expense: a.is_family_expense === undefined ? undefined : a.is_family_expense ? "Y" : "N",
    })
    if (!outcome.ok) return { ok: false, message: outcome.message }
    return { ok: true, message: outcome.message, card: outcome.card }
  },

  async revise_income(raw, ctx) {
    const a = revisionArgs.parse(raw)
    const outcome = await reviseIncome(ctx, a.code, {
      amount: a.amount,
      name: a.name,
      date: a.date,
      category: a.category,
      wallet: a.wallet,
    })
    if (!outcome.ok) return { ok: false, message: outcome.message }
    return { ok: true, message: outcome.message, card: outcome.card }
  },
}

export const telegramToolNames = telegramTool.functionDeclarations.map((d) => d.name)

/**
 * Jalankan satu tool. Error dikembalikan sebagai hasil (bukan dilempar) supaya
 * model bisa memperbaiki sendiri, mis. mencoba kategori lain.
 */
export async function executeTelegramTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const handler = handlers[name]
  if (!handler) {
    return { ok: false, message: `Tool "${name}" tidak dikenal.` }
  }
  try {
    return await handler(rawArgs ?? {}, ctx)
  } catch (err) {
    // Zod error → ambil pesan pertama supaya AI bisa memperbaiki argumennya.
    if (err instanceof z.ZodError) {
      const issue = err.issues[0]
      return {
        ok: false,
        message: `Argumen tidak valid: ${issue?.path.join(".") || "parameter"} — ${issue?.message ?? "tidak valid"}`,
      }
    }
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga"
    return { ok: false, message }
  }
}
