import { db } from "@/lib/db"
import { escapeHtml, formatAmount } from "./format"
import { getCategoryBudgetStatuses } from "./budget-status"
import type { SessionData } from "@/lib/auth-simple"
import { resolveTgScope } from "./scope"

/**
 * Query & format laporan keuangan untuk perintah bot Telegram.
 *
 * Semua angka diambil langsung dari database (bukan dari AI), lalu diformat
 * menjadi HTML Telegram. Jadi hasilnya konsisten dan bisa dipercaya —
 * sama seperti kartu transaksi di cards.ts.
 */

// ── Format dasar ─────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "-"
}

export function monthShort(month: number): string {
  return MONTHS_SHORT[month - 1] ?? "-"
}

/** Rasio dalam persen dengan 1 desimal, mis. "42,6%". */
export function percent(value: number, digits = 1): string {
  if (!isFinite(value)) return "—"
  return `${value.toLocaleString("id-ID", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

/** "Rp 1.500.000" — tanpa desimal, pakai pemisah ribuan id-ID. */
export function rupiah(value: number): string {
  return formatAmount(value)
}

/** Baris "label : nilai" yang rata kiri, format monospace-friendly. */
function row(label: string, value: string, icon?: string): string {
  return `${icon ? `${icon} ` : ""}${label}: ${value}`
}

// ── Helper query ─────────────────────────────────────────────────────────────

interface FlowRow {
  income: number
  expense: number
  income_count: number
  expense_count: number
}

/**
 * Total pemasukan & pengeluaran untuk sekumpulan user dalam satu bulan.
 * `excludeFamily` dipakai pada mode personal: beban rumah tangga milik
 * anggota lain tidak ikut dihitung (konsisten dengan halaman Rekap).
 *
 * CATATAN `is_initial`: transaksi bertanda "data awal" tetap ikut dihitung di
 * sini, sama seperti tabel Rekap di web yang menampilkan baris AWAL. Jadi
 * angka /rekap boleh berbeda dari posisi kas di Dashboard (yang mengikuti
 * saldo awal + arus kas dan memang mengecualikan data awal) — persis seperti
 * perbedaan Dashboard vs Rekap di aplikasi.
 */
async function flowFor(
  userIds: string[],
  year: number,
  month: number,
  excludeFamily: boolean,
): Promise<FlowRow> {
  const famClause = excludeFamily ? " AND is_family_expense = 0" : ""
  const row = await db
    .prepare<[string[], number, number, string[], number, number], FlowRow>(
      `SELECT
         COALESCE(SUM(CASE WHEN src = 'i' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN src = 'e' THEN amount ELSE 0 END), 0) AS expense,
         COUNT(CASE WHEN src = 'i' THEN 1 END) AS income_count,
         COUNT(CASE WHEN src = 'e' THEN 1 END) AS expense_count
       FROM (
         SELECT 'i' AS src, amount FROM incomes
          WHERE user_id = ANY(?) AND year = ? AND month = ?
         UNION ALL
         SELECT 'e' AS src, amount FROM expenses
          WHERE user_id = ANY(?) AND year = ? AND month = ?${famClause}
       ) t`
    )
    .get(userIds, year, month, userIds, year, month)

  return {
    income: Number(row?.income ?? 0),
    expense: Number(row?.expense ?? 0),
    income_count: Number(row?.income_count ?? 0),
    expense_count: Number(row?.expense_count ?? 0),
  }
}

export interface CategoryTotal {
  id: string | null
  name: string
  total: number
}

/** Total pengeluaran per kategori dalam satu bulan, terbesar dulu. */
async function expensesByCategory(
  userIds: string[],
  year: number,
  month: number,
  excludeFamily: boolean,
): Promise<CategoryTotal[]> {
  const famClause = excludeFamily ? " AND e.is_family_expense = 0" : ""
  const rows = await db
    .prepare<[string[], number, number], CategoryTotal>(
      `SELECT e.category_id AS id,
              COALESCE(ec.name, '(tanpa kategori)') AS name,
              COALESCE(SUM(e.amount), 0) AS total
         FROM expenses e
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
        WHERE e.user_id = ANY(?) AND e.year = ? AND e.month = ?${famClause}
        GROUP BY e.category_id, ec.name
        ORDER BY total DESC`
    )
    .all(userIds, year, month) as CategoryTotal[]

  return rows.map((r) => ({ ...r, total: Number(r.total) || 0 }))
}

/** Batas belanja bulanan (spending_limit) dari anggota keluarga. */
async function spendingLimits(
  session: SessionData,
  userIds: string[],
): Promise<number | null> {
  if (!session.householdId) return null
  const row = await db
    .prepare<[string, string[]], { total: number }>(
      `SELECT COALESCE(SUM(spending_limit), 0) AS total
         FROM household_members
        WHERE household_id = ? AND user_id = ANY(?) AND spending_limit IS NOT NULL`
    )
    .get(session.householdId, userIds) as { total: number } | undefined
  const total = Number(row?.total ?? 0)
  return total > 0 ? total : null
}

// ── /rekap ───────────────────────────────────────────────────────────────────

export interface RecapOptions {
  /** Bulanan: 1-12. Defaults ke bulan berjalan. */
  month?: number
  year?: number
}

/**
 * Rekap satu bulan: pemasukan, pengeluaran, sisa, rasio tabungan, sisa
 * anggaran global, jumlah transaksi, dan top-3 kategori pengeluaran.
 */
export async function recapMonthly(
  session: SessionData,
  today: string,
  opts: RecapOptions = {},
): Promise<string> {
  const scope = await resolveTgScope(session)
  const [ty, tm] = today.split("-").map(Number)
  const year = opts.year ?? ty
  const month = opts.month ?? tm

  const flow = await flowFor(scope.userIds, year, month, scope.excludeFamilyExpense)
  const categories = await expensesByCategory(scope.userIds, year, month, scope.excludeFamilyExpense)
  const limit = await spendingLimits(session, scope.userIds)

  const net = flow.income - flow.expense
  const savingRatio = flow.income > 0 ? (net / flow.income) * 100 : 0
  const totalTx = flow.income_count + flow.expense_count

  // Sisa anggaran global (batas belanja bulanan anggota keluarga).
  let budgetLine = ""
  if (limit != null) {
    const sisa = limit - flow.expense
    budgetLine = `\n${row("Sisa anggaran", rupiah(sisa), "🎯")}`
    if (sisa < 0) {
      budgetLine += `\n⚠️ Melebihi batas belanja ${rupiah(Math.abs(sisa))}`
    }
  }

  // Kategori yang butuh perhatian (WARNING / DANGER) — satu query untuk semua
  // kategori yang ada pengeluarannya.
  const catIds = categories.map((c) => c.id).filter((id): id is string => !!id)
  const statuses = await getCategoryBudgetStatuses(session, catIds, year, month)
  const attention: string[] = []
  for (const cat of categories) {
    if (!cat.id) continue
    const status = statuses.get(cat.id)
    if (status?.status && status.status !== "NORMAL") {
      const label = status.status === "DANGER" ? "DANGER" : "WARNING"
      attention.push(`${cat.name} (${label})`)
    }
  }

  const top = categories.slice(0, 3)
  const topLines = top.length
    ? top
        .map((c) => {
          const pct = flow.expense > 0 ? (c.total / flow.expense) * 100 : 0
          return `• ${escapeHtml(c.name)} — ${rupiah(c.total)} (${percent(pct, 0)})`
        })
        .join("\n")
    : "• Belum ada pengeluaran."

  const netIcon = net >= 0 ? "🟢" : "🔴"
  const netLabel = net >= 0 ? "Sisa" : "Defisit"

  // Untuk bulan berjalan, tampilkan "s/d <tanggal>".
  const isCurrentMonth = year === ty && month === tm
  const dayNow = Number(today.slice(8, 10))
  const period = isCurrentMonth ? ` (s/d ${dayNow} ${monthShort(month)})` : ""

  const lines = [
    `📊 <b>Rekap ${monthName(month)} ${year}${period}</b>`,
    "",
    row("Pemasukan", rupiah(flow.income), "💰"),
    row("Pengeluaran", rupiah(flow.expense), "💸"),
    `${netIcon} ${netLabel}: ${rupiah(Math.abs(net))}`,
    row("Rasio tabungan", percent(savingRatio), "📈"),
  ]
  if (budgetLine) lines.push(budgetLine.trim())
  lines.push(
    "",
    `🔢 Transaksi: ${totalTx} (${flow.income_count} masuk · ${flow.expense_count} keluar)`,
    "",
    "🏷️ <b>Top pengeluaran</b>",
    topLines,
  )
  if (attention.length > 0) {
    lines.push("", `⚠️ ${attention.length} kategori butuh perhatian: ${attention.map(escapeHtml).join(", ")}`)
  }

  return lines.join("\n")
}

// ── /rekap_harian ────────────────────────────────────────────────────────────

/**
 * Rekap harian: pengeluaran & pemasukan hari ini plus tren 7 hari terakhir.
 */
export async function recapDaily(session: SessionData, today: string, date: string = today): Promise<string> {
  const scope = await resolveTgScope(session)
  const famClause = scope.excludeFamilyExpense ? " AND is_family_expense = 0" : ""

  const todayRow = await db
    .prepare<[string[], string, string[], string], { income: number; expense: number; count: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN src = 'i' THEN amount ELSE 0 END), 0) AS income,
         COALESCE(SUM(CASE WHEN src = 'e' THEN amount ELSE 0 END), 0) AS expense,
         COUNT(*) AS count
       FROM (
         SELECT 'i' AS src, amount FROM incomes
          WHERE user_id = ANY(?) AND date = ?
         UNION ALL
         SELECT 'e' AS src, amount FROM expenses
          WHERE user_id = ANY(?) AND date = ?${famClause}
       ) t`
    )
    .get(scope.userIds, date, scope.userIds, date)

  // 7 hari terakhir (termasuk tanggal yang diminta) — mini-trend.
  // Batas atas = tanggal yang diminta, supaya transaksi bertanggal masa depan (mis.
  // saldo awal yang di-assign ke bulan berikutnya) tidak ikut dihitung.
  const trend = await db
    .prepare<[string[], string, string, string[], string, string], { date: string; income: number; expense: number }>(
      `SELECT date,
              COALESCE(SUM(CASE WHEN src = 'i' THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN src = 'e' THEN amount ELSE 0 END), 0) AS expense
         FROM (
           SELECT 'i' AS src, date, amount FROM incomes
            WHERE user_id = ANY(?) AND date >= ? AND date <= ?
           UNION ALL
           SELECT 'e' AS src, date, amount FROM expenses
            WHERE user_id = ANY(?) AND date >= ? AND date <= ?${famClause}
         ) t
        GROUP BY date
        ORDER BY date`
    )
    .all(scope.userIds, trendStart(date, 6), date, scope.userIds, trendStart(date, 6), date) as {
    date: string; income: number; expense: number
  }[]

  const income = Number(todayRow?.income ?? 0)
  const expense = Number(todayRow?.expense ?? 0)
  const net = income - expense

  const lines = [
    `📅 <b>Harian ${escapeHtml(date)}${date === today ? " (hari ini)" : ""}</b>`,
    "",
    row("Pemasukan", rupiah(income), "💰"),
    row("Pengeluaran", rupiah(expense), "💸"),
    `${net >= 0 ? "🟢" : "🔴"} ${net >= 0 ? "Sisa" : "Defisit"}: ${rupiah(Math.abs(net))}`,
    `🔢 Transaksi: ${Number(todayRow?.count ?? 0)}`,
    "",
    "📈 <b>7 hari terakhir</b>",
  ]

  if (trend.length === 0) {
    lines.push("• Belum ada transaksi.")
  } else {
    const maxValue = Math.max(...trend.map((t) => Math.max(Number(t.income), Number(t.expense))), 1)
    for (const t of trend) {
      const tIncome = Number(t.income)
      const tExpense = Number(t.expense)
      const bar = "▬".repeat(Math.round((Math.max(tIncome, tExpense) / maxValue) * 10))
      lines.push(
        `• ${escapeHtml(t.date)} — ${bar} masuk ${rupiah(tIncome)} · keluar ${rupiah(tExpense)}`,
      )
    }
  }

  return lines.join("\n")
}

/** Tanggal "YYYY-MM-DD" mundur `days` hari (hasil sudah bisa negatif). */
function trendStart(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// ── /rekap_tahunan ───────────────────────────────────────────────────────────

export interface YearRecapOptions {
  year?: number
}

/**
 * Rekap per bulan untuk satu tahun: 12 baris (pemasukan, pengeluaran,
 * selisih, status). Cermin tabel Rekap di web.
 */
export async function recapYearly(
  session: SessionData,
  today: string,
  opts: YearRecapOptions = {},
): Promise<string> {
  const scope = await resolveTgScope(session)
  const year = opts.year ?? Number(today.slice(0, 4))
  const famClause = scope.excludeFamilyExpense ? " AND is_family_expense = 0" : ""

  const rows = await db
    .prepare<[string[], number, string[], number], { month: number; income: number; expense: number }>(
      `SELECT month,
              COALESCE(SUM(CASE WHEN src = 'i' THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN src = 'e' THEN amount ELSE 0 END), 0) AS expense
         FROM (
           SELECT 'i' AS src, month, amount FROM incomes
            WHERE user_id = ANY(?) AND year = ?
           UNION ALL
           SELECT 'e' AS src, month, amount FROM expenses
            WHERE user_id = ANY(?) AND year = ?${famClause}
         ) t
        GROUP BY month
        ORDER BY month`
    )
    .all(scope.userIds, year, scope.userIds, year) as {
    month: number; income: number; expense: number
  }[]

  const byMonth = new Map(rows.map((r) => [r.month, r]))
  const currentMonth = Number(today.slice(5, 7))
  const isCurrentYear = Number(today.slice(0, 4)) === year

  let totalIncome = 0
  let totalExpense = 0

  const lines = [`📆 <b>Rekap Tahunan ${year}</b>`, ""]

  for (let m = 1; m <= 12; m++) {
    const r = byMonth.get(m)
    const income = Number(r?.income ?? 0)
    const expense = Number(r?.expense ?? 0)
    totalIncome += income
    totalExpense += expense

    const selisih = income - expense
    // Status: surplus (hijau), defisit (merah), nol (abu).
    const status = selisih > 0 ? "🟢" : selisih < 0 ? "🔴" : "⚪"
    const belum = isCurrentYear && m > currentMonth ? " (belum)" : ""

    lines.push(
      `${status} <b>${monthShort(m)}</b> — masuk ${rupiah(income)} · keluar ${rupiah(expense)} · selisih ${selisih >= 0 ? "+" : ""}${rupiah(selisih)}${belum}`,
    )
  }

  const net = totalIncome - totalExpense
  lines.push(
    "",
    `💰 Total pemasukan: ${rupiah(totalIncome)}`,
    `💸 Total pengeluaran: ${rupiah(totalExpense)}`,
    `${net >= 0 ? "🟢" : "🔴"} ${net >= 0 ? "Sisa" : "Defisit"}: ${rupiah(Math.abs(net))}`,
  )

  return lines.join("\n")
}

// ── /rekap_kategori ──────────────────────────────────────────────────────────

/**
 * Pengeluaran per kategori beserta status anggaran (MAX / PENGELUARAN /
 * SISA / STATUS) — cermin kolom "Data" di Rekap per tahun.
 */
export async function recapCategory(
  session: SessionData,
  today: string,
  opts: RecapOptions = {},
): Promise<string> {
  const scope = await resolveTgScope(session)
  const [ty, tm] = today.split("-").map(Number)
  const year = opts.year ?? ty
  const month = opts.month ?? tm

  const categories = await expensesByCategory(scope.userIds, year, month, scope.excludeFamilyExpense)
  const catIds = categories.map((c) => c.id).filter((id): id is string => !!id)
  const statuses = await getCategoryBudgetStatuses(session, catIds, year, month)

  const isCurrentMonth = year === ty && month === tm
  const dayNow = Number(today.slice(8, 10))
  const period = isCurrentMonth ? ` (s/d ${dayNow} ${monthShort(month)})` : ""

  const lines = [`🏷️ <b>Kategori pengeluaran — ${monthName(month)} ${year}${period}</b>`, ""]

  if (categories.length === 0) {
    lines.push("Belum ada pengeluaran pada periode ini.")
    return lines.join("\n")
  }

  for (const cat of categories) {
    const status = cat.id ? statuses.get(cat.id) : undefined
    const max = status?.max ?? 0
    const hasBudget = status?.hasBudget ?? false
    const sisa = status?.sisa ?? 0

    const statusText = !hasBudget
      ? "—"
      : status?.status === "DANGER"
        ? "🔴 DANGER"
        : status?.status === "WARNING"
          ? "🟡 WARNING"
          : "🟢 NORMAL"

    lines.push(
      `<b>${escapeHtml(cat.name)}</b> — ${rupiah(cat.total)}` +
        (hasBudget
          ? `\n   MAX ${rupiah(max)} · sisa ${rupiah(sisa)} · ${statusText}`
          : `\n   Tidak ada anggaran · ${statusText}`),
    )
  }

  return lines.join("\n")
}

// ── /anggaran ───────────────────────────────────────────────────────────────

/**
 * Status anggaran bulan berjalan: daftar kategori yang WARNING/DANGER plus
 * sisa hari menuju batas akhir bulan. Selalu bulan berjalan — tidak pernah
 * berpindah ke bulan lain.
 */
export async function budgetReport(session: SessionData, today: string): Promise<string> {
  const scope = await resolveTgScope(session)
  const [year, month] = today.split("-").map(Number)

  // Kategori yang punya anggaran persentase di tahun ini (bulan mana pun).
  // Kategori yang disembunyikan tidak ditampilkan — sama seperti halaman Rekap.
  // Persentase bulan berjalan yang kosong otomatis memakai persentase tertinggi
  // dari bulan lain (fallback di getCategoryBudgetStatuses, sama seperti Rekap),
  // jadi kategori tidak hilang hanya karena barisnya belum dibuat untuk bulan ini.
  const budgetRows = await db
    .prepare<[string[], number], { category_id: string; name: string }>(
      `SELECT DISTINCT b.category_id, ec.name
         FROM budgets b
         JOIN expense_categories ec ON ec.id = b.category_id
        WHERE b.user_id = ANY(?) AND b.year = ? AND b.percentage > 0
          AND ec.is_hidden = 0`,
    )
    .all(scope.userIds, year) as { category_id: string; name: string }[]

  // Kategori dengan anggaran nominal (tanpa persentase).
  const nominalRows = await db
    .prepare<[string[], number], { category_id: string; name: string }>(
      `SELECT n.category_id, ec.name
         FROM category_nominal_budgets n
         JOIN expense_categories ec ON ec.id = n.category_id
        WHERE n.user_id = ANY(?) AND n.year = ? AND ec.is_hidden = 0`,
    )
    .all(scope.userIds, year) as { category_id: string; name: string }[]

  const catIds = Array.from(
    new Set([...budgetRows.map((r) => r.category_id), ...nominalRows.map((r) => r.category_id)]),
  )
  if (catIds.length === 0) {
    return `🎯 <b>Anggaran ${monthName(month)} ${year}</b>\n\nBelum ada anggaran yang diatur bulan ini.`
  }

  const statuses = await getCategoryBudgetStatuses(session, catIds, year, month)
  const nameById = new Map<string, string>()
  for (const r of [...budgetRows, ...nominalRows]) nameById.set(r.category_id, r.name)

  const items = catIds
    .map((id) => ({ id, name: nameById.get(id) ?? "-", status: statuses.get(id) }))
    .filter((i) => i.status?.hasBudget)
    .sort((a, b) => (a.status!.sisa - b.status!.sisa))

  const lines = [`🎯 <b>Anggaran ${monthName(month)} ${year}</b>`, ""]

  if (items.length === 0) {
    lines.push("Belum ada anggaran yang berlaku bulan ini.")
    return lines.join("\n")
  }

  // Sisa hari menuju batas akhir bulan.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const dayNow = Number(today.slice(8, 10))
  const daysLeft = daysInMonth - dayNow

  lines.push(
    `⏳ Sisa hari menuju batas: <b>${daysLeft} hari</b> (s/d ${daysInMonth} ${monthShort(month)})`,
    "",
  )

  const problem = items.filter((i) => i.status!.status !== "NORMAL")
  const safe = items.filter((i) => i.status!.status === "NORMAL")

  if (problem.length > 0) {
    lines.push("<b>⚠️ Perlu perhatian</b>")
    for (const i of problem) {
      const s = i.status!
      const over = s.sisa < 0
      lines.push(
        `• ${escapeHtml(i.name)} — ${over ? "kelebihan" : "sisa"} ${rupiah(Math.abs(s.sisa))}` +
          ` dari ${rupiah(s.max)} · ${s.status === "DANGER" ? "🔴 DANGER" : "🟡 WARNING"}`,
      )
    }
    lines.push("")
  }

  lines.push(`<b>🟢 Aman (${safe.length})</b>`)
  for (const i of safe) {
    const s = i.status!
    lines.push(`• ${escapeHtml(i.name)} — sisa ${rupiah(s.sisa)} dari ${rupiah(s.max)}`)
  }

  return lines.join("\n")
}
