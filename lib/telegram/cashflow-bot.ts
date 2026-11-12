import { escapeHtml, formatAmount } from "./format"
import { budgetReport, recapCategory, recapDaily, recapMonthly, recapYearly } from "./reports"
import { searchTransactions, topCategories, txList } from "./search"
import { currentMonth, extractPeriod, periodArg, shiftPeriod } from "./period"
import { todayFromDb, type ToolContext } from "./tools"
import type { Out } from "./out"
import type { InlineKeyboard } from "./telegram-api"

/**
 * Cashflow di bot: rekap (hari/bulan/tahun/kategori/anggaran/top) dan riwayat
 * transaksi dengan periode & filter. Semua angka dibaca langsung dari database.
 */

type Ctx = Omit<ToolContext, "today">

/** Tombol periode cepat — dipakai di bawah rekap & riwayat. */
function quickPeriodRow(prefix: string, includeYear: boolean): InlineKeyboard[number] {
  return [
    { text: "Hari ini", data: `c:${prefix}hari ini` },
    { text: "Kemarin", data: `c:${prefix}kemarin` },
    { text: "Bulan ini", data: `c:${prefix}bulan ini` },
    { text: "Bulan lalu", data: `c:${prefix}bulan lalu` },
    includeYear
      ? { text: "Tahun ini", data: `c:${prefix}tahun ini` }
      : { text: "7 hari", data: `c:${prefix}7 hari terakhir` },
  ]
}

type RekapMode = "ringkas" | "kategori" | "anggaran" | "top"

const REKAP_USAGE = [
  "Format: <code>/rekap [periode] [kategori | anggaran | top N]</code>",
  "",
  "Contoh:",
  "<code>/rekap</code> — bulan ini",
  "<code>/rekap kemarin</code> · <code>/rekap 3 hari lalu</code> · <code>/rekap 05/11</code>",
  "<code>/rekap november</code> · <code>/rekap 2026-10</code>",
  "<code>/rekap tahun</code> · <code>/rekap 2025</code>",
  "<code>/rekap kategori bulan lalu</code>",
  "<code>/rekap anggaran</code> · <code>/rekap top 5</code>",
].join("\n")

/**
 * Satu perintah untuk semua rekap: periode (hari/bulan/tahun) + jenis laporan
 * (ringkasan, kategori, anggaran, top) dibaca dari argumen.
 */
export async function handleRekap(out: Out, ctx: Ctx, arg: string): Promise<void> {
  const today = await todayFromDb()
  const session = ctx.session

  // Pisahkan kata penentu jenis laporan dari periode.
  const tokens = arg.trim().split(/\s+/).filter(Boolean)
  const kept: string[] = []
  let mode: RekapMode = "ringkas"
  let topN = 5
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase()
    if (t === "kategori" || t === "category") mode = "kategori"
    else if (t === "anggaran" || t === "budget") mode = "anggaran"
    else if (t === "top") {
      mode = "top"
      const n = Number(tokens[i + 1])
      if (Number.isInteger(n) && n > 0 && n <= 20) {
        topN = n
        i++
      }
    } else kept.push(tokens[i])
  }

  const { period: parsed, rest } = extractPeriod(kept.join(" "), today)
  if (rest) {
    await out.send(`Periode “${escapeHtml(rest)}” tidak dikenali.\n\n${REKAP_USAGE}`)
    return
  }
  const period = parsed ?? currentMonth(today)

  // Tombol di bawah laporan: ◀ ▶, periode cepat, dan jenis laporan.
  const keyboard: InlineKeyboard = []
  const modePrefix = mode === "ringkas" ? "rekap " : `rekap ${mode} `
  if (mode !== "anggaran") {
    const prev = shiftPeriod(period, -1, today)
    const next = shiftPeriod(period, 1, today)
    const nav = []
    if (prev) nav.push({ text: `◀ ${prev.label}`, data: `c:${modePrefix}${periodArg(prev)}` })
    if (next) nav.push({ text: `${next.label} ▶`, data: `c:${modePrefix}${periodArg(next)}` })
    if (nav.length > 0) keyboard.push(nav)
    keyboard.push(quickPeriodRow(modePrefix, mode === "ringkas"))
  }
  const pa = periodArg(period)
  keyboard.push([
    { text: "📊 Ringkasan", data: `c:rekap ${pa}` },
    { text: "🗂 Kategori", data: `c:rekap kategori ${pa}` },
  ])
  keyboard.push([
    { text: "🎯 Anggaran", data: "c:rekap anggaran" },
    { text: "🏆 Top", data: `c:rekap top ${pa}` },
  ])

  // Kategori & top hanya bermakna per bulan; hari ikut bulannya.
  const monthOf =
    period.kind === "month" || period.kind === "day" ? { year: period.year, month: period.month! } : null

  if (mode === "anggaran") {
    await out.reply(await budgetReport(session, today), keyboard)
    return
  }

  if (mode === "kategori" || mode === "top") {
    if (!monthOf) {
      await out.send("Laporan ini per bulan. Sebutkan bulannya, mis. <code>/rekap kategori november</code>.")
      return
    }
    if (mode === "kategori") {
      await out.reply(await recapCategory(session, today, monthOf), keyboard)
      return
    }
    const items = await topCategories(session, today, {
      limit: topN,
      period: `${monthOf.year}-${String(monthOf.month).padStart(2, "0")}`,
    })
    if (items.length === 0) {
      await out.reply(`🏆 <b>Top pengeluaran — ${escapeHtml(period.label)}</b>\n\nBelum ada pengeluaran.`, keyboard)
      return
    }
    const lines = items.map(
      (i) =>
        `• ${escapeHtml(i.name)} — ${formatAmount(i.total)} (${i.pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%)`,
    )
    await out.reply(
      `🏆 <b>Top ${items.length} pengeluaran — ${escapeHtml(period.label)}</b>\n\n${lines.join("\n")}`,
      keyboard,
    )
    return
  }

  // Ringkasan sesuai jenis periode.
  if (period.kind === "day") {
    await out.reply(await recapDaily(session, today, period.from), keyboard)
  } else if (period.kind === "month") {
    await out.reply(await recapMonthly(session, today, { month: period.month, year: period.year }), keyboard)
  } else if (period.kind === "year") {
    await out.reply(await recapYearly(session, today, { year: period.year }), keyboard)
  } else {
    await out.send(
      `Rekap per rentang (${escapeHtml(period.label)}) belum tersedia. Pakai hari, bulan, atau tahun — atau lihat daftarnya dengan <code>/riwayat ${escapeHtml(period.label)}</code>.`,
    )
  }
}

interface HistoryFilters {
  keyword?: string
  category?: string
  wallet?: string
  kind?: "expense" | "income"
  limit?: number
}

/** Filter riwayat: `kategori X`, `dompet X`, `masuk`/`keluar`, `limit N`; sisanya kata kunci. */
function parseHistoryFilters(rest: string): HistoryFilters {
  const result: HistoryFilters = {}
  const keywords: string[] = []
  const tokens = rest.trim().split(/\s+/).filter(Boolean)
  const KEY: Record<string, "category" | "wallet" | "limit"> = {
    kategori: "category",
    category: "category",
    dompet: "wallet",
    wallet: "wallet",
    limit: "limit",
    jumlah: "limit",
  }
  const KIND: Record<string, "expense" | "income"> = {
    keluar: "expense",
    pengeluaran: "expense",
    expense: "expense",
    masuk: "income",
    pemasukan: "income",
    pendapatan: "income",
    income: "income",
  }

  let current: "category" | "wallet" | "limit" | null = null
  const values: Record<string, string[]> = { category: [], wallet: [], limit: [] }
  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (KEY[lower]) {
      current = KEY[lower]
      continue
    }
    if (KIND[lower]) {
      result.kind = KIND[lower]
      current = null
      continue
    }
    if (current) values[current].push(token)
    else keywords.push(token)
  }

  if (values.category.length) result.category = values.category.join(" ")
  if (values.wallet.length) result.wallet = values.wallet.join(" ")
  const limit = Number(values.limit[0])
  if (Number.isFinite(limit) && limit > 0) result.limit = Math.min(50, Math.floor(limit))
  if (keywords.length) result.keyword = keywords.join(" ")
  return result
}

/**
 * Riwayat transaksi dengan periode & filter. Tanpa argumen: 10 transaksi
 * terakhir. Menggantikan /cari dan /transaksi.
 */
export async function handleRiwayat(out: Out, ctx: Ctx, arg: string): Promise<void> {
  const today = await todayFromDb()
  const { period, rest } = extractPeriod(arg, today)
  const filters = parseHistoryFilters(rest)
  const hasFilter = !!(period || filters.keyword || filters.category || filters.wallet || filters.kind)

  const { rows, total } = await searchTransactions(ctx.session, {
    keyword: filters.keyword,
    category: filters.category,
    wallet: filters.wallet,
    kind: filters.kind,
    from: period?.from,
    to: period?.to,
    limit: filters.limit ?? (hasFilter ? 20 : 10),
  })

  const bits: string[] = []
  if (period) bits.push(escapeHtml(period.label))
  if (filters.kind) bits.push(filters.kind === "expense" ? "pengeluaran" : "pemasukan")
  if (filters.keyword) bits.push(`“${escapeHtml(filters.keyword)}”`)
  if (filters.category) bits.push(`kategori ${escapeHtml(filters.category)}`)
  if (filters.wallet) bits.push(`dompet ${escapeHtml(filters.wallet)}`)
  const title = hasFilter
    ? `🧾 <b>Riwayat — ${bits.join(" · ")}</b>`
    : `🧾 <b>${rows.length} transaksi terakhir</b>`

  const footer =
    total > rows.length
      ? `\n\n⚠️ Menampilkan ${rows.length} dari ${total} — persempit dengan periode atau kata kunci.`
      : ""
  const codeHint =
    rows.length > 0 ? "\n\nKode (6 karakter) dipakai untuk <code>/revisi</code> dan <code>/hapus</code>." : ""

  const keyboard: InlineKeyboard = []
  if (period && period.kind !== "range") {
    const prev = shiftPeriod(period, -1, today)
    const next = shiftPeriod(period, 1, today)
    const nav = []
    if (prev) nav.push({ text: `◀ ${prev.label}`, data: `c:riwayat ${periodArg(prev)}` })
    if (next) nav.push({ text: `${next.label} ▶`, data: `c:riwayat ${periodArg(next)}` })
    if (nav.length > 0) keyboard.push(nav)
  }
  keyboard.push(quickPeriodRow("riwayat ", false))
  if (period && period.kind !== "range") {
    keyboard.push([{ text: `📊 Rekap ${period.label}`, data: `c:rekap ${periodArg(period)}` }])
  }

  await out.reply(
    `${title}\n\n${txList(rows, "Tidak ada transaksi yang cocok.")}${footer}${codeHint}`,
    keyboard,
  )
}

/** Menu utama cashflow: pintu masuk semua fitur transaksi. */
export async function showCashflowMenu(out: Out): Promise<void> {
  await out.reply(
    [
      "💸 <b>Cashflow</b>",
      "",
      "Catat langsung lewat chat (<code>makan siang 25rb</code>, <code>gaji 5jt</code>, atau foto struk).",
      "Pilih menu di bawah untuk melihat dan mengelola transaksi:",
    ].join("\n"),
    [
      [
        { text: "🧾 Riwayat", data: "c:riwayat" },
        { text: "📊 Rekap", data: "c:rekap" },
      ],
      [
        { text: "🗂 Kategori", data: "c:rekap kategori" },
        { text: "🎯 Anggaran", data: "c:rekap anggaran" },
        { text: "🏆 Top", data: "c:rekap top" },
      ],
      [{ text: "🔎 Cari transaksi", data: "cf:s" }],
      [
        { text: "✏️ Revisi", data: "cf:e" },
        { text: "🗑 Hapus", data: "cf:h" },
      ],
      [
        { text: "🤝 Pinjaman", data: "c:pinjaman" },
        { text: "📈 Investasi", data: "c:investasi" },
      ],
    ],
  )
}
