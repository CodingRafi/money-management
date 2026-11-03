import { db } from "@/lib/db"
import { escapeHtml } from "./format"
import { calcProfitLoss } from "@/lib/investment"
import { calcLoanStatus } from "@/lib/loan"
import type { SessionData } from "@/lib/auth-simple"
import { resolveTgScope } from "./scope"

/**
 * Laporan domain lain (pinjaman & investasi) untuk perintah bot Telegram.
 *
 * Sama seperti reports.ts: angka diambil langsung dari database, bukan dari
 * AI, supaya konsisten dengan aplikasi.
 */

// ── /pinjaman ────────────────────────────────────────────────────────────────

interface LoanRow {
  id: string
  name: string
  type: string
  principal_amount: number
  total_paid: number
  due_date: string | null
  status: string
  payment_likelihood: string | null
}

const LIKELIHOOD_LABEL: Record<string, string> = {
  LANCAR: "🟢 LANCAR",
  MERAGUKAN: "🟡 MERAGUKAN",
  MACET: "🔴 MACET",
}

const LOAN_STATUS_LABEL: Record<string, string> = {
  ONGOING: "LANCAR",
  LUNAS: "LUNAS",
  TERLAMBAT: "TERLAMBAT",
}

/**
 * Daftar pinjaman aktif (piutang & utang) dengan sisa angsuran, jatuh tempo
 * terdekat, dan status pembayaran.
 */
export async function loanReport(session: SessionData, today: string): Promise<string> {
  const scope = await resolveTgScope(session)

  const rows = await db
    .prepare<[string[]], LoanRow>(
      `SELECT l.id, l.name, l.type, l.principal_amount, l.due_date, l.status,
              l.payment_likelihood,
              COALESCE(SUM(lp.principal_paid), 0) AS total_paid
         FROM loans l
         LEFT JOIN loan_payments lp ON lp.loan_id = l.id
        WHERE l.user_id = ANY(?) AND l.is_active = 1
        GROUP BY l.id, l.name, l.type, l.principal_amount, l.due_date, l.status,
                 l.payment_likelihood
        ORDER BY l.type, l.due_date NULLS LAST, l.created_at DESC`,
    )
    .all(scope.userIds) as LoanRow[]

  if (rows.length === 0) {
    return "🤝 <b>Pinjaman</b>\n\nBelum ada pinjaman tercatat."
  }

  const piutang = rows.filter((r) => r.type === "PIUTANG")
  const hutang = rows.filter((r) => r.type === "HUTANG")

  const sisaOf = (r: LoanRow) => Math.max(0, Number(r.principal_amount) - Number(r.total_paid))
  const totalPiutang = piutang.reduce((s, r) => s + sisaOf(r), 0)
  const totalHutang = hutang.reduce((s, r) => s + sisaOf(r), 0)

  const lines: string[] = ["🤝 <b>Pinjaman</b>", ""]

  const section = (title: string, items: LoanRow[], total: number) => {
    if (items.length === 0) return
    lines.push(`<b>${title}</b> — total sisa ${formatRp(total)}`)
    for (const l of items) {
      const sisa = sisaOf(l)
      // Status dihitung ulang (bukan dari kolom status), sama seperti
      // halaman Pinjaman di web: LUNAS / TERLAMBAT / ONGOING.
      const live = calcLoanStatus(l.due_date, sisa)
      const overdue = live === "TERLAMBAT"

      const bits = [`sisa ${formatRp(sisa)}`]
      if (l.due_date) bits.push(`jatuh tempo ${l.due_date}${overdue ? " ⚠️ terlambat" : ""}`)
      else bits.push("tanpa jatuh tempo")

      const likelihood = l.payment_likelihood
        ? ` · ${LIKELIHOOD_LABEL[l.payment_likelihood] ?? l.payment_likelihood}`
        : ""

      lines.push(`• ${escapeHtml(l.name)} — ${bits.join(" · ")} · ${LOAN_STATUS_LABEL[live] ?? live}${likelihood}`)
    }
    lines.push("")
  }

  section("📥 Piutang (diberi)", piutang, totalPiutang)
  section("📤 Utang (dipinjam)", hutang, totalHutang)

  // Jatuh tempo terdekat: utamakan yang belum lewat; kalau semua sudah lewat,
  // tampilkan yang paling lama lewat.
  const withDue = rows.filter((r) => r.due_date && sisaOf(r) > 0)
  const upcoming = withDue.filter((r) => r.due_date! >= today)
  const overdueLoans = withDue.filter((r) => r.due_date! < today)

  const nearest = (upcoming.length > 0
    ? [...upcoming].sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))[0]
    : [...overdueLoans].sort((a, b) => (a.due_date! > b.due_date! ? -1 : 1))[0])

  if (nearest) {
    const isOverdue = nearest.due_date! < today
    lines.push(
      `⏰ Jatuh tempo terdekat: ${escapeHtml(nearest.name)} — ${nearest.due_date}` +
        (isOverdue ? " ⚠️ sudah lewat" : ""),
    )
  }

  if (overdueLoans.length > 0) {
    lines.push(`⏰ ${overdueLoans.length} pinjaman lewat jatuh tempo`)
  }

  const macet = rows.filter((r) => r.payment_likelihood === "MACET")
  if (macet.length > 0) {
    lines.push(
      `🔴 ${macet.length} piutang berstatus MACET (total ${formatRp(macet.reduce((s, r) => s + sisaOf(r), 0))})`,
    )
  }

  return lines.join("\n").trim()
}

// ── /investasi ──────────────────────────────────────────────────────────────

interface AssetTx {
  type: string
  quantity: string
  total_amount: number
}

interface AssetRow {
  id: string
  name: string
  category_name: string
  unit: string | null
  is_closed: number
  txs: AssetTx[]
}

/**
 * Portofolio investasi: jumlah aset, total modal, nilai/hasil per aset, dan
 * pencapaian target (investment_goals).
 */
export async function investmentReport(session: SessionData): Promise<string> {
  const scope = await resolveTgScope(session)

  const assets = await db
    .prepare<[string[]], AssetRow>(
      `SELECT i.id, i.name, i.unit, i.is_closed, ic.name AS category_name
         FROM investments i
         JOIN investment_categories ic ON ic.id = i.category_id
        WHERE i.user_id = ANY(?) AND i.is_active = 1
        ORDER BY i.created_at DESC, i.name`,
    )
    .all(scope.userIds) as Omit<AssetRow, "txs">[]

  if (assets.length === 0) {
    return "📈 <b>Investasi</b>\n\nBelum ada aset investasi tercatat."
  }

  // Transaksi per aset (dikelompokkan dalam satu query).
  const txs = await db
    .prepare<[string[]], { investment_id: string; type: string; quantity: string; total_amount: number }>(
      `SELECT it.investment_id, it.type, it.quantity, it.total_amount
         FROM investment_transactions it
         JOIN investments i ON i.id = it.investment_id
        WHERE i.user_id = ANY(?) AND it.is_initial = 0
        ORDER BY it.date`,
    )
    .all(scope.userIds) as { investment_id: string; type: string; quantity: string; total_amount: number }[]

  const txsByAsset = new Map<string, AssetTx[]>()
  for (const t of txs) {
    const list = txsByAsset.get(t.investment_id) ?? []
    list.push({ type: t.type, quantity: String(t.quantity), total_amount: Number(t.total_amount) })
    txsByAsset.set(t.investment_id, list)
  }

  let totalModal = 0
  let totalNilai = 0
  const lines: string[] = ["📈 <b>Investasi</b>", "", `Aset aktif: ${assets.length}`, ""]

  for (const a of assets) {
    const assetTxs = txsByAsset.get(a.id) ?? []
    const pl = calcProfitLoss(
      assetTxs.map((t) => ({
        type: t.type,
        quantity: t.quantity,
        total_amount: String(t.total_amount),
      })),
    )
    // Nilai = modal − modal yang sudah terjual (SELL mengurangi nilai aktif).
    const nilai = pl.totalModal - pl.totalHasil
    totalModal += pl.totalModal
    totalNilai += nilai

    const plLabel =
      pl.status === "PROFIT" ? `🟢 +${formatRp(pl.profitLoss)}`
      : pl.status === "LOSS" ? `🔴 ${formatRp(pl.profitLoss)}`
      : pl.status === "BREAK_EVEN" ? `⚪ 0`
      : "⚪ belum terjual"

    const closed = a.is_closed ? " · <i>ditutup</i>" : ""

    lines.push(
      `• <b>${escapeHtml(a.name)}</b> (${escapeHtml(a.category_name)})${closed}\n` +
        `   modal ${formatRp(pl.totalModal)} · nilai ${formatRp(nilai)} · P/L ${plLabel}` +
        (pl.totalDividen > 0 ? ` · dividen ${formatRp(pl.totalDividen)}` : ""),
    )
  }

  lines.push("", `💰 Total modal: ${formatRp(totalModal)}`)
  lines.push(`📊 Total nilai aktif: ${formatRp(totalNilai)}`)

  // Target vs pencapaian (investment_goals).
  const goals = await db
    .prepare<[string[]], { name: string; target_amount: number | null; modal: number }>(
      `SELECT g.name, g.target_amount,
              COALESCE((SELECT SUM(CASE WHEN it.type = 'BUY' THEN it.total_amount ELSE 0 END)
                          FROM investment_transactions it
                         WHERE it.goal_id = g.id AND it.is_initial = 0), 0) AS modal
         FROM investment_goals g
        WHERE g.user_id = ANY(?) AND g.is_active = 1
        ORDER BY g.sort_order, g.name`,
    )
    .all(scope.userIds) as { name: string; target_amount: number | null; modal: number }[]

  if (goals.length > 0) {
    lines.push("", "🎯 <b>Target</b>")
    for (const g of goals) {
      const modal = Number(g.modal)
      if (g.target_amount == null) {
        lines.push(`• ${escapeHtml(g.name)} — modal ${formatRp(modal)} · belum ada target`)
        continue
      }
      const target = Number(g.target_amount)
      const pct = target > 0 ? (modal / target) * 100 : 0
      const bar = "█".repeat(Math.min(10, Math.round(pct / 10))).padEnd(10, "░")
      lines.push(
        `• ${escapeHtml(g.name)} — ${formatRp(modal)} / ${formatRp(target)} (${pct.toFixed(0)}%) ${bar}`,
      )
    }
  }

  return lines.join("\n")
}

function formatRp(n: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n)}`
}
