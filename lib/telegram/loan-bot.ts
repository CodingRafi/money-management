import { db } from "@/lib/db"
import { calcLoanStatus } from "@/lib/loan"
import { FinanceError, financeService } from "@/services/finance.service"
import { escapeHtml, formatAmount, shortCode } from "./format"
import { loanReport } from "./domain"
import { resolveTgScope } from "./scope"
import { clip, type Out } from "./out"
import { extractPeriod } from "./period"
import { parseAmountLoose } from "./revision"
import type { InlineKeyboard } from "./telegram-api"
import type { ToolContext } from "./tools"

/**
 * Manajemen pinjaman lewat bot: daftar/cari, detail, bayar cicilan, revisi,
 * dan hapus. Semua perubahan memakai aturan yang sama dengan halaman web
 * (hanya pemilik pinjaman yang boleh mengubah; pinjaman yang masih punya
 * cicilan tidak bisa dihapus).
 */

type Ctx = Omit<ToolContext, "today">

interface LoanListRow {
  id: string
  name: string
  type: string
  principal_amount: number
  total_paid: number
  due_date: string | null
}

interface LoanDetailRow {
  id: string
  user_id: string
  name: string
  description: string | null
  type: string
  principal_amount: number
  interest_rate: number
  interest_type: string
  start_date: string
  due_date: string | null
  status: string
  payment_likelihood: string | null
}

interface PaymentRow {
  id: string
  principal_paid: number
  interest_paid: number
  total_paid: number
  date: string
}

const STATUS_LABEL: Record<string, string> = {
  ONGOING: "Lancar",
  LUNAS: "Lunas",
  TERLAMBAT: "⚠️ Terlambat",
}

const LIKELIHOOD_LABEL: Record<string, string> = {
  LANCAR: "🟢 Lancar",
  MERAGUKAN: "🟡 Meragukan",
  MACET: "🔴 Macet",
}

const LIKELIHOOD_KEYS: Record<string, string> = { l: "LANCAR", m: "MERAGUKAN", c: "MACET" }

const typeIcon = (type: string) => (type === "PIUTANG" ? "📥" : "📤")
const typeLabel = (type: string) => (type === "PIUTANG" ? "Piutang (diberi)" : "Utang (dipinjam)")

// ── Pencarian pinjaman ───────────────────────────────────────────────────────

/** Cari pinjaman aktif dalam scope user, opsional dengan kata kunci nama. */
async function listLoans(ctx: Ctx, search?: string): Promise<LoanListRow[]> {
  const scope = await resolveTgScope(ctx.session)
  const params: unknown[] = [scope.userIds]
  let nameClause = ""
  if (search) {
    nameClause = " AND (l.name ILIKE ? OR l.description ILIKE ?)"
    params.push(`%${search}%`, `%${search}%`)
  }
  const rows = await db
    .prepare<unknown[], LoanListRow>(
      `SELECT l.id, l.name, l.type, l.principal_amount, l.due_date,
              COALESCE(SUM(lp.principal_paid), 0) AS total_paid
         FROM loans l
         LEFT JOIN loan_payments lp ON lp.loan_id = l.id
        WHERE l.user_id = ANY(?) AND l.is_active = 1${nameClause}
        GROUP BY l.id, l.name, l.type, l.principal_amount, l.due_date, l.created_at
        ORDER BY l.type, l.due_date NULLS LAST, l.created_at DESC`,
    )
    .all(...params) as LoanListRow[]
  return rows.map((r) => ({
    ...r,
    principal_amount: Number(r.principal_amount),
    total_paid: Number(r.total_paid),
  }))
}

const sisaOf = (r: { principal_amount: number; total_paid: number }) =>
  Math.max(0, r.principal_amount - r.total_paid)

/** Cari satu pinjaman berdasar kode 6 karakter (hanya yang terlihat oleh user). */
export async function findLoanIdByCode(ctx: Ctx, code: string): Promise<string | null> {
  const scope = await resolveTgScope(ctx.session)
  const row = await db
    .prepare(
      `SELECT id FROM loans
        WHERE user_id = ANY(?) AND is_active = 1
          AND (id = ? OR upper(right(replace(id, '-', ''), 6)) = upper(?))
        LIMIT 1`,
    )
    .get(scope.userIds, code, code) as { id: string } | undefined
  return row?.id ?? null
}

function loanButtons(rows: LoanListRow[]): InlineKeyboard {
  return rows.slice(0, 12).map((r) => [
    {
      text: `${typeIcon(r.type)} ${clip(r.name, 22)} · sisa ${formatAmount(sisaOf(r))}`,
      data: `pj:v:${r.id}`,
    },
  ])
}

// ── /pinjaman ────────────────────────────────────────────────────────────────

/**
 * `/pinjaman` → ringkasan + tombol per pinjaman.
 * `/pinjaman budi` → cari berdasarkan nama; bila hanya satu langsung buka detail.
 */
export async function showLoans(out: Out, ctx: Ctx, today: string, search = ""): Promise<void> {
  const term = search.trim()

  if (!term) {
    const [summary, rows] = await Promise.all([loanReport(ctx.session, today), listLoans(ctx)])
    const keyboard: InlineKeyboard = [
      ...loanButtons(rows),
      [{ text: "➕ Pinjaman baru", data: "pj:n" }],
    ]
    const hint = rows.length > 12 ? "\n\nMenampilkan 12 tombol pertama — cari dengan <code>/pinjaman nama</code>." : ""
    await out.reply(
      `${summary}\n\n👇 Pilih pinjaman untuk bayar cicilan, revisi, atau hapus.${hint}`,
      keyboard,
    )
    return
  }

  const rows = await listLoans(ctx, term)
  if (rows.length === 0) {
    await out.reply(
      `🔎 Tidak ada pinjaman yang cocok dengan “${escapeHtml(term)}”.`,
      [[{ text: "📋 Semua pinjaman", data: "c:pinjaman" }]],
    )
    return
  }
  if (rows.length === 1) {
    await showLoanDetail(out, ctx, rows[0].id)
    return
  }
  await out.reply(
    `🔎 <b>${rows.length} pinjaman cocok</b> dengan “${escapeHtml(term)}”. Pilih salah satu:`,
    [...loanButtons(rows), [{ text: "⬅️ Semua pinjaman", data: "c:pinjaman" }]],
  )
}

// ── Detail ───────────────────────────────────────────────────────────────────

async function loadLoan(ctx: Ctx, loanId: string): Promise<LoanDetailRow | null> {
  const scope = await resolveTgScope(ctx.session)
  const row = await db
    .prepare(
      `SELECT id, user_id, name, description, type, principal_amount, interest_rate,
              interest_type, start_date, due_date, status, payment_likelihood
         FROM loans WHERE id = ? AND user_id = ANY(?) AND is_active = 1`,
    )
    .get(loanId, scope.userIds) as LoanDetailRow | undefined
  return row ?? null
}

async function totalPaidOf(loanId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(SUM(principal_paid), 0) AS t FROM loan_payments WHERE loan_id = ?")
    .get(loanId) as { t: number }
  return Number(row.t)
}

export async function showLoanDetail(out: Out, ctx: Ctx, loanId: string, notice?: string): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  if (!loan) {
    await out.reply("Pinjaman tidak ditemukan (mungkin sudah dihapus).", [
      [{ text: "📋 Semua pinjaman", data: "c:pinjaman" }],
    ])
    return
  }

  const payments = await db
    .prepare<[string], PaymentRow>(
      `SELECT id, principal_paid, interest_paid, total_paid, date
         FROM loan_payments WHERE loan_id = ?
        ORDER BY date DESC, created_at DESC LIMIT 5`,
    )
    .all(loanId) as PaymentRow[]

  const principal = Number(loan.principal_amount)
  const paid = await totalPaidOf(loanId)
  const sisa = Math.max(0, principal - paid)
  const live = calcLoanStatus(loan.due_date, sisa)

  const lines: string[] = []
  if (notice) lines.push(notice, "")
  lines.push(
    `${typeIcon(loan.type)} <b>${escapeHtml(loan.name)}</b>`,
    `${typeLabel(loan.type)} · kode <code>${shortCode(loan.id)}</code>`,
    "",
    `💰 Pokok: <b>${formatAmount(principal)}</b>`,
    `✅ Terbayar: ${formatAmount(paid)}`,
    `⏳ Sisa: <b>${formatAmount(sisa)}</b>`,
    `💹 Bunga: ${Number(loan.interest_rate)}% ${escapeHtml(loan.interest_type)}`,
    `📅 Mulai: ${loan.start_date} · Jatuh tempo: ${loan.due_date ?? "—"}`,
    `📌 Status: ${STATUS_LABEL[live] ?? live}` +
      (loan.type === "PIUTANG" && loan.payment_likelihood
        ? ` · ${LIKELIHOOD_LABEL[loan.payment_likelihood] ?? loan.payment_likelihood}`
        : ""),
  )
  if (loan.description) lines.push(`🗒️ ${escapeHtml(loan.description)}`)

  if (payments.length > 0) {
    lines.push("", "<b>Cicilan terakhir:</b>")
    for (const p of payments) {
      lines.push(
        `• ${p.date} — pokok ${formatAmount(Number(p.principal_paid))} + bunga ${formatAmount(Number(p.interest_paid))}`,
      )
    }
  }

  const keyboard: InlineKeyboard = []
  const canWrite = loan.user_id === ctx.session.userId
  if (canWrite) {
    if (sisa > 0) keyboard.push([{ text: "💸 Bayar cicilan", data: `pj:b:${loan.id}` }])
    keyboard.push([
      { text: "✏️ Revisi", data: `pj:e:${loan.id}` },
      { text: "🗑 Hapus pinjaman", data: `pj:d:${loan.id}` },
    ])
    for (const p of payments.slice(0, 3)) {
      keyboard.push([
        { text: `🗑 Hapus cicilan ${p.date} · ${formatAmount(Number(p.principal_paid))}`, data: `pj:p:${p.id}` },
      ])
    }
  } else {
    lines.push("", "<i>Pinjaman milik anggota lain — hanya bisa dilihat.</i>")
  }
  keyboard.push([{ text: "⬅️ Semua pinjaman", data: "c:pinjaman" }])

  await out.reply(lines.join("\n"), keyboard)
}

// ── Bayar cicilan ────────────────────────────────────────────────────────────

/** Tombol "Bayar cicilan" → tanya jumlahnya. */
export async function askPayment(out: Out, ctx: Ctx, loanId: string): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  if (!loan || loan.user_id !== ctx.session.userId) {
    await out.send("Pinjaman tidak ditemukan atau bukan milik Anda.")
    return
  }
  const sisa = Math.max(0, Number(loan.principal_amount) - (await totalPaidOf(loanId)))
  await out.prompt(
    [
      `💸 <b>Bayar cicilan — ${escapeHtml(loan.name)}</b>`,
      `Sisa pokok: ${formatAmount(sisa)}`,
      "",
      "Balas pesan ini dengan <b>jumlah pokok</b> yang dibayar, mis. <code>500rb</code>.",
      "Tanggal opsional: <code>500rb kemarin</code> atau <code>500rb 2026-11-01</code>.",
      "Bunga dihitung otomatis.",
    ].join("\n"),
    { domain: "pj", action: "b", code: shortCode(loan.id) },
    "mis. 500rb",
  )
}

/** Proses jawaban jumlah cicilan (dari balasan atau `/pinjaman bayar`). */
export async function payLoan(
  out: Out,
  ctx: Ctx,
  today: string,
  loanId: string,
  text: string,
): Promise<void> {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  const amount = tokens.length > 0 ? parseAmountLoose(tokens[0]) : null
  if (!amount) {
    await out.send("Jumlah belum terbaca. Tulis nominalnya, mis. <code>500rb</code> atau <code>1,5jt</code>.")
    return
  }

  let date = today
  const dateText = tokens.slice(1).join(" ")
  if (dateText) {
    const { period } = extractPeriod(dateText, today)
    if (!period || period.kind !== "day") {
      await out.send("Tanggal tidak dikenali. Contoh: <code>kemarin</code>, <code>2026-11-01</code>, <code>05/11</code>.")
      return
    }
    date = period.from
  }

  let paymentId: string
  try {
    paymentId = await financeService.addLoanPayment(ctx.session.userId, loanId, {
      principalPaid: amount,
      date,
    })
  } catch (err) {
    if (err instanceof FinanceError) {
      await out.send(`❌ ${escapeHtml(err.message)}`)
      return
    }
    throw err
  }

  const pay = await db
    .prepare("SELECT principal_paid, interest_paid, total_paid FROM loan_payments WHERE id = ?")
    .get(paymentId) as { principal_paid: number; interest_paid: number; total_paid: number } | undefined

  const notice = pay
    ? `✅ <b>Cicilan tercatat</b> (${date})\nPokok ${formatAmount(Number(pay.principal_paid))} + bunga ${formatAmount(Number(pay.interest_paid))} = <b>${formatAmount(Number(pay.total_paid))}</b>`
    : "✅ Cicilan tercatat."
  await showLoanDetail(out, ctx, loanId, notice)
}

// ── Revisi ───────────────────────────────────────────────────────────────────

export async function showEditMenu(out: Out, ctx: Ctx, loanId: string): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  if (!loan || loan.user_id !== ctx.session.userId) {
    await out.reply("Pinjaman tidak ditemukan atau bukan milik Anda.")
    return
  }
  const keyboard: InlineKeyboard = [
    [
      { text: "📝 Nama", data: `pj:f:${loan.id}:n` },
      { text: "📅 Jatuh tempo", data: `pj:f:${loan.id}:t` },
    ],
    [
      { text: "💹 Bunga (%)", data: `pj:f:${loan.id}:b` },
      { text: "🗒️ Keterangan", data: `pj:f:${loan.id}:k` },
    ],
  ]
  if (loan.type === "PIUTANG") {
    keyboard.push([
      { text: "🟢 Lancar", data: `pj:l:${loan.id}:l` },
      { text: "🟡 Meragukan", data: `pj:l:${loan.id}:m` },
      { text: "🔴 Macet", data: `pj:l:${loan.id}:c` },
    ])
  }
  keyboard.push([{ text: "⬅️ Kembali", data: `pj:v:${loan.id}` }])
  await out.reply(`✏️ <b>Revisi — ${escapeHtml(loan.name)}</b>\nPilih bagian yang ingin diubah:`, keyboard)
}

const FIELD_PROMPTS: Record<string, { title: string; hint: string; placeholder: string }> = {
  n: { title: "nama pinjaman", hint: "Balas dengan nama baru.", placeholder: "nama baru" },
  t: { title: "jatuh tempo", hint: "Balas dengan tanggal, mis. <code>2027-01-31</code> atau <code>31/01</code>. Ketik <code>-</code> untuk menghapus.", placeholder: "2027-01-31" },
  b: { title: "bunga (%)", hint: "Balas dengan persen bunga, mis. <code>1,5</code>. Ketik <code>0</code> bila tanpa bunga.", placeholder: "1,5" },
  k: { title: "keterangan", hint: "Balas dengan keterangan baru. Ketik <code>-</code> untuk mengosongkan.", placeholder: "keterangan" },
}

export async function askEditField(out: Out, ctx: Ctx, loanId: string, field: string): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  const spec = FIELD_PROMPTS[field]
  if (!loan || loan.user_id !== ctx.session.userId || !spec) {
    await out.send("Pinjaman tidak ditemukan atau bukan milik Anda.")
    return
  }
  await out.prompt(
    `✏️ <b>Ubah ${spec.title} — ${escapeHtml(loan.name)}</b>\n\n${spec.hint}`,
    { domain: "pj", action: "f", code: shortCode(loan.id), arg: field },
    spec.placeholder,
  )
}

/** Terapkan jawaban revisi satu field. */
export async function applyEdit(
  out: Out,
  ctx: Ctx,
  today: string,
  loanId: string,
  field: string,
  text: string,
): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  if (!loan || loan.user_id !== ctx.session.userId) {
    await out.send("Pinjaman tidak ditemukan atau bukan milik Anda.")
    return
  }
  const value = text.trim()
  const clear = value === "-"

  if (field === "n") {
    if (!value || clear) return void (await out.send("Nama tidak boleh kosong."))
    await db.prepare("UPDATE loans SET name = ?, updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(value.slice(0, 200), loanId, ctx.session.userId)
  } else if (field === "t") {
    let due: string | null = null
    if (!clear) {
      const { period } = extractPeriod(value, today)
      if (!period || period.kind !== "day") {
        return void (await out.send("Tanggal tidak dikenali. Contoh: <code>2027-01-31</code> atau <code>31/01</code>."))
      }
      due = period.from
    }
    const sisa = Math.max(0, Number(loan.principal_amount) - (await totalPaidOf(loanId)))
    await db.prepare("UPDATE loans SET due_date = ?, status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(due, calcLoanStatus(due, sisa), loanId, ctx.session.userId)
  } else if (field === "b") {
    const rate = parseFloat(value.replace(",", ".").replace("%", ""))
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000) {
      return void (await out.send("Bunga tidak valid. Tulis angka persen, mis. <code>1,5</code>."))
    }
    await db.prepare("UPDATE loans SET interest_rate = ?, updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(rate, loanId, ctx.session.userId)
  } else if (field === "k") {
    await db.prepare("UPDATE loans SET description = ?, updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(clear || !value ? null : value.slice(0, 500), loanId, ctx.session.userId)
  } else {
    await out.send("Bagian yang diubah tidak dikenali.")
    return
  }

  await showLoanDetail(out, ctx, loanId, "✅ <b>Pinjaman diperbarui</b>")
}

/** Ubah kelancaran bayar (hanya piutang). */
export async function setLikelihood(out: Out, ctx: Ctx, loanId: string, key: string): Promise<void> {
  const value = LIKELIHOOD_KEYS[key]
  const loan = await loadLoan(ctx, loanId)
  if (!loan || loan.user_id !== ctx.session.userId || loan.type !== "PIUTANG" || !value) {
    await out.reply("Hanya piutang milik Anda yang punya status kelancaran.")
    return
  }
  await db.prepare("UPDATE loans SET payment_likelihood = ?, updated_at = NOW() WHERE id = ? AND user_id = ?")
    .run(value, loanId, ctx.session.userId)
  await showLoanDetail(out, ctx, loanId, `✅ Kelancaran diubah: ${LIKELIHOOD_LABEL[value]}`)
}

// ── Hapus pinjaman ───────────────────────────────────────────────────────────

export async function confirmDeleteLoan(out: Out, ctx: Ctx, loanId: string): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  if (!loan || loan.user_id !== ctx.session.userId) {
    await out.reply("Pinjaman tidak ditemukan atau bukan milik Anda.")
    return
  }
  const count = await db
    .prepare("SELECT COUNT(*) AS cnt FROM loan_payments WHERE loan_id = ?")
    .get(loanId) as { cnt: number }
  if (Number(count.cnt) > 0) {
    await out.reply(
      `⚠️ <b>${escapeHtml(loan.name)}</b> masih punya ${count.cnt} cicilan. Hapus semua cicilannya dulu, baru pinjamannya.`,
      [[{ text: "⬅️ Kembali", data: `pj:v:${loan.id}` }]],
    )
    return
  }
  await out.reply(
    `🗑 Hapus pinjaman <b>${escapeHtml(loan.name)}</b> (${formatAmount(Number(loan.principal_amount))})?\nTindakan ini tidak bisa dibatalkan dari bot.`,
    [[
      { text: "✅ Ya, hapus", data: `pj:dy:${loan.id}` },
      { text: "Batal", data: `pj:v:${loan.id}` },
    ]],
  )
}

export async function deleteLoan(out: Out, ctx: Ctx, loanId: string): Promise<void> {
  const loan = await loadLoan(ctx, loanId)
  if (!loan || loan.user_id !== ctx.session.userId) {
    await out.reply("Pinjaman tidak ditemukan atau bukan milik Anda.")
    return
  }
  const count = await db
    .prepare("SELECT COUNT(*) AS cnt FROM loan_payments WHERE loan_id = ?")
    .get(loanId) as { cnt: number }
  if (Number(count.cnt) > 0) {
    await out.reply("⚠️ Hapus semua cicilan terlebih dahulu.", [[{ text: "⬅️ Kembali", data: `pj:v:${loan.id}` }]])
    return
  }
  await db.prepare("UPDATE loans SET is_active = 0, updated_at = NOW() WHERE id = ? AND user_id = ?")
    .run(loanId, ctx.session.userId)
  await out.reply(`🗑️ Pinjaman <b>${escapeHtml(loan.name)}</b> dihapus.`, [
    [{ text: "📋 Semua pinjaman", data: "c:pinjaman" }],
  ])
}

// ── Hapus cicilan ────────────────────────────────────────────────────────────

async function loadPayment(ctx: Ctx, paymentId: string) {
  return (await db
    .prepare(
      `SELECT lp.id, lp.loan_id, lp.principal_paid, lp.date, l.name AS loan_name
         FROM loan_payments lp JOIN loans l ON l.id = lp.loan_id
        WHERE lp.id = ? AND l.user_id = ? AND l.is_active = 1`,
    )
    .get(paymentId, ctx.session.userId)) as
    | { id: string; loan_id: string; principal_paid: number; date: string; loan_name: string }
    | undefined
}

export async function confirmDeletePayment(out: Out, ctx: Ctx, paymentId: string): Promise<void> {
  const pay = await loadPayment(ctx, paymentId)
  if (!pay) {
    await out.reply("Cicilan tidak ditemukan.")
    return
  }
  await out.reply(
    `🗑 Hapus cicilan <b>${escapeHtml(pay.loan_name)}</b> tanggal ${pay.date} (pokok ${formatAmount(Number(pay.principal_paid))})?`,
    [[
      { text: "✅ Ya, hapus", data: `pj:py:${pay.id}` },
      { text: "Batal", data: `pj:v:${pay.loan_id}` },
    ]],
  )
}

export async function deletePayment(out: Out, ctx: Ctx, paymentId: string): Promise<void> {
  const pay = await loadPayment(ctx, paymentId)
  if (!pay) {
    await out.reply("Cicilan tidak ditemukan (mungkin sudah dihapus).")
    return
  }
  await db.transaction(async () => {
    await db.prepare("DELETE FROM loan_payments WHERE id = ?").run(paymentId)
    const loan = await db
      .prepare("SELECT due_date, principal_amount FROM loans WHERE id = ?")
      .get(pay.loan_id) as { due_date: string | null; principal_amount: number }
    const remaining = Number(loan.principal_amount) - (await totalPaidOf(pay.loan_id))
    await db.prepare("UPDATE loans SET status = ?, updated_at = NOW() WHERE id = ?")
      .run(calcLoanStatus(loan.due_date, remaining), pay.loan_id)
  })
  await showLoanDetail(out, ctx, pay.loan_id, "🗑️ Cicilan dihapus.")
}
