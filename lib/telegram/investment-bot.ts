import { db } from "@/lib/db"
import { calcProfitLoss } from "@/lib/investment"
import { escapeHtml, formatAmount, shortCode } from "./format"
import { investmentReport } from "./domain"
import { resolveTgScope } from "./scope"
import { clip, type Out, type PromptRef } from "./out"
import type { InlineKeyboard } from "./telegram-api"
import type { ToolContext } from "./tools"

/**
 * Manajemen investasi lewat bot: daftar/cari aset, detail, tutup/buka,
 * hapus aset & transaksi. Menambah aset dan transaksi (beli/jual/dividen)
 * butuh banyak data (dompet, kantong, satuan), jadi dijawab dengan kalimat
 * bebas yang diteruskan ke asisten AI — lihat {@link investmentAiText}.
 */

type Ctx = Omit<ToolContext, "today">

interface AssetListRow {
  id: string
  user_id: string
  name: string
  unit: string | null
  is_closed: number
  category_name: string
}

interface TxRow {
  id: string
  type: string
  quantity: string
  total_amount: number
  date: string
}

const TYPE_LABEL: Record<string, string> = { BUY: "Beli", SELL: "Jual", DIVIDEND: "Dividen" }
const TYPE_KEYS: Record<string, "BUY" | "SELL" | "DIVIDEND"> = { b: "BUY", s: "SELL", d: "DIVIDEND" }

async function listAssets(ctx: Ctx, search?: string): Promise<AssetListRow[]> {
  const scope = await resolveTgScope(ctx.session)
  const params: unknown[] = [scope.userIds]
  let clause = ""
  if (search) {
    clause = " AND (i.name ILIKE ? OR ic.name ILIKE ? OR i.ticker ILIKE ?)"
    params.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  return (await db
    .prepare<unknown[], AssetListRow>(
      `SELECT i.id, i.user_id, i.name, i.unit, i.is_closed, ic.name AS category_name
         FROM investments i
         JOIN investment_categories ic ON ic.id = i.category_id
        WHERE i.user_id = ANY(?) AND i.is_active = 1${clause}
        ORDER BY i.is_closed, i.created_at DESC, i.name`,
    )
    .all(...params)) as AssetListRow[]
}

/** Cari aset berdasarkan kode 6 karakter (hanya yang terlihat oleh user). */
export async function findInvestmentIdByCode(ctx: Ctx, code: string): Promise<string | null> {
  const scope = await resolveTgScope(ctx.session)
  const row = await db
    .prepare(
      `SELECT id FROM investments
        WHERE user_id = ANY(?) AND is_active = 1
          AND (id = ? OR upper(right(replace(id, '-', ''), 6)) = upper(?))
        LIMIT 1`,
    )
    .get(scope.userIds, code, code) as { id: string } | undefined
  return row?.id ?? null
}

async function loadAsset(ctx: Ctx, id: string): Promise<AssetListRow | null> {
  const scope = await resolveTgScope(ctx.session)
  const row = await db
    .prepare(
      `SELECT i.id, i.user_id, i.name, i.unit, i.is_closed, ic.name AS category_name
         FROM investments i
         JOIN investment_categories ic ON ic.id = i.category_id
        WHERE i.id = ? AND i.user_id = ANY(?) AND i.is_active = 1`,
    )
    .get(id, scope.userIds) as AssetListRow | undefined
  return row ?? null
}

function assetButtons(rows: AssetListRow[]): InlineKeyboard {
  return rows.slice(0, 12).map((a) => [
    {
      text: `${a.is_closed ? "🔒" : "📈"} ${clip(a.name, 24)} · ${clip(a.category_name, 14)}`,
      data: `iv:v:${a.id}`,
    },
  ])
}

// ── /investasi ───────────────────────────────────────────────────────────────

/**
 * `/investasi` → portofolio + tombol per aset.
 * `/investasi bbca` → cari aset; bila hanya satu langsung buka detail.
 */
export async function showInvestments(out: Out, ctx: Ctx, search = ""): Promise<void> {
  const term = search.trim()

  if (!term) {
    const [summary, assets] = await Promise.all([investmentReport(ctx.session), listAssets(ctx)])
    const hint = assets.length > 12 ? "\n\nMenampilkan 12 aset pertama — cari dengan <code>/investasi nama</code>." : ""
    await out.reply(`${summary}\n\n👇 Pilih aset untuk mengelola.${hint}`, [
      ...assetButtons(assets),
      [{ text: "➕ Aset baru", data: "iv:n" }],
    ])
    return
  }

  const assets = await listAssets(ctx, term)
  if (assets.length === 0) {
    await out.reply(`🔎 Tidak ada aset yang cocok dengan “${escapeHtml(term)}”.`, [
      [{ text: "📋 Semua aset", data: "c:investasi" }],
    ])
    return
  }
  if (assets.length === 1) {
    await showAsset(out, ctx, assets[0].id)
    return
  }
  await out.reply(`🔎 <b>${assets.length} aset cocok</b> dengan “${escapeHtml(term)}”. Pilih salah satu:`, [
    ...assetButtons(assets),
    [{ text: "⬅️ Semua aset", data: "c:investasi" }],
  ])
}

// ── Detail aset ──────────────────────────────────────────────────────────────

export async function showAsset(out: Out, ctx: Ctx, id: string, notice?: string): Promise<void> {
  const asset = await loadAsset(ctx, id)
  if (!asset) {
    await out.reply("Aset tidak ditemukan (mungkin sudah dihapus).", [[{ text: "📋 Semua aset", data: "c:investasi" }]])
    return
  }

  const all = (await db
    .prepare<[string], TxRow>(
      `SELECT id, type, quantity, total_amount, date
         FROM investment_transactions WHERE investment_id = ?
        ORDER BY date DESC, created_at DESC`,
    )
    .all(id)) as TxRow[]

  const pl = calcProfitLoss(
    all.map((t) => ({ type: t.type, quantity: String(t.quantity), total_amount: String(t.total_amount) })),
  )
  const held = pl.totalBuyQty - pl.totalSellQty
  const unit = asset.unit ? ` ${escapeHtml(asset.unit)}` : ""
  const recent = all.slice(0, 5)

  const lines: string[] = []
  if (notice) lines.push(notice, "")
  lines.push(
    `📈 <b>${escapeHtml(asset.name)}</b>`,
    `${escapeHtml(asset.category_name)} · kode <code>${shortCode(asset.id)}</code> · ${asset.is_closed ? "🔒 ditutup" : "aktif"}`,
    "",
    `💰 Modal: <b>${formatAmount(pl.totalModal)}</b>`,
    `📦 Dimiliki: ${Number(held.toFixed(6))}${unit}` +
      (pl.avgCostPerUnit > 0 ? ` · rata-rata beli ${formatAmount(pl.avgCostPerUnit)}` : ""),
    `💵 Hasil jual: ${formatAmount(pl.totalHasil)} · Dividen: ${formatAmount(pl.totalDividen)}`,
  )
  if (pl.status !== "HOLDING") {
    lines.push(
      `${pl.profitLoss >= 0 ? "🟢" : "🔴"} P/L realisasi: ${formatAmount(pl.profitLoss)}`,
    )
  }

  if (recent.length > 0) {
    lines.push("", "<b>Transaksi terakhir:</b>")
    for (const t of recent) {
      lines.push(
        `• ${t.date} ${TYPE_LABEL[t.type] ?? t.type} ${t.quantity}${unit} — ${formatAmount(Number(t.total_amount))}`,
      )
    }
  }

  const keyboard: InlineKeyboard = []
  if (asset.user_id === ctx.session.userId) {
    if (!asset.is_closed) {
      keyboard.push([
        { text: "🟢 Beli", data: `iv:t:${asset.id}:b` },
        { text: "🔴 Jual", data: `iv:t:${asset.id}:s` },
        { text: "💰 Dividen", data: `iv:t:${asset.id}:d` },
      ])
    }
    keyboard.push([
      { text: asset.is_closed ? "🔓 Buka kembali" : "🔒 Tutup aset", data: `iv:x:${asset.id}` },
      { text: "🗑 Hapus aset", data: `iv:d:${asset.id}` },
    ])
    for (const t of recent.slice(0, 3)) {
      keyboard.push([
        {
          text: `🗑 ${t.date} ${TYPE_LABEL[t.type] ?? t.type} ${formatAmount(Number(t.total_amount))}`,
          data: `iv:q:${t.id}`,
        },
      ])
    }
  } else {
    lines.push("", "<i>Aset milik anggota lain — hanya bisa dilihat.</i>")
  }
  keyboard.push([{ text: "⬅️ Semua aset", data: "c:investasi" }])

  await out.reply(lines.join("\n"), keyboard)
}

// ── Tambah aset / transaksi (lewat AI) ───────────────────────────────────────

export async function askNewAsset(out: Out): Promise<void> {
  await out.prompt(
    [
      "➕ <b>Aset investasi baru</b>",
      "",
      "Balas dengan nama aset dan kategorinya, mis.:",
      "• <code>Saham BBCA kategori Saham satuan lot</code>",
      "• <code>Emas Antam kategori Emas dompet BCA</code>",
    ].join("\n"),
    { domain: "iv", action: "n", code: "NEW" },
    "Saham BBCA kategori Saham",
  )
}

export async function askTransaction(out: Out, ctx: Ctx, id: string, typeKey: string): Promise<void> {
  const asset = await loadAsset(ctx, id)
  const type = TYPE_KEYS[typeKey]
  if (!asset || !type || asset.user_id !== ctx.session.userId || asset.is_closed) {
    await out.send("Aset tidak ditemukan, sudah ditutup, atau bukan milik Anda.")
    return
  }
  const examples: Record<string, string[]> = {
    BUY: ["<code>2 lot total 1,8jt dari BCA kantong Dana Pensiun</code>", "<code>500rb dari Dana</code> (jumlah 1 bila tak disebut)"],
    SELL: ["<code>1 lot total 950rb ke BCA</code>"],
    DIVIDEND: ["<code>120rb ke BCA</code>"],
  }
  await out.prompt(
    [
      `${type === "BUY" ? "🟢" : type === "SELL" ? "🔴" : "💰"} <b>${TYPE_LABEL[type]} — ${escapeHtml(asset.name)}</b>`,
      "",
      "Balas dengan jumlah, total nilai, dan dompet. Tanggal opsional (default hari ini).",
      ...examples[type].map((e) => `• ${e}`),
      type === "BUY" ? "Pembelian wajib memilih kantong investasi." : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { domain: "iv", action: "t", code: shortCode(asset.id), arg: typeKey },
    type === "DIVIDEND" ? "120rb ke BCA" : "2 lot total 1,8jt dari BCA",
  )
}

/**
 * Susun kalimat untuk asisten AI dari jawaban user atas prompt investasi.
 * Mengembalikan null bila aset tidak ditemukan.
 */
export async function investmentAiText(ctx: Ctx, ref: PromptRef, userText: string): Promise<string | null> {
  if (ref.action === "n") {
    return `Daftarkan aset investasi baru (panggil create_investment). Detail dari pengguna: ${userText}`
  }
  if (ref.action === "t") {
    const id = await findInvestmentIdByCode(ctx, ref.code)
    const asset = id ? await loadAsset(ctx, id) : null
    const type = TYPE_KEYS[ref.arg ?? ""]
    if (!asset || !type) return null
    return (
      `Catat transaksi investasi ${type} (panggil create_investment_transaction) untuk aset ` +
      `"${asset.name}" dengan investment_id=${asset.id}. Detail dari pengguna: ${userText}. ` +
      `Jika dompet atau kantong disebut dengan nama, cari id-nya lewat list_wallets / list_investment_goals.`
    )
  }
  return null
}

// ── Tutup / buka aset ────────────────────────────────────────────────────────

export async function toggleClosed(out: Out, ctx: Ctx, id: string): Promise<void> {
  const asset = await loadAsset(ctx, id)
  if (!asset || asset.user_id !== ctx.session.userId) {
    await out.reply("Aset tidak ditemukan atau bukan milik Anda.")
    return
  }
  if (asset.is_closed) {
    await db.prepare("UPDATE investments SET is_closed = 0, closed_at = NULL, updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(id, ctx.session.userId)
  } else {
    await db.prepare("UPDATE investments SET is_closed = 1, closed_at = NOW(), updated_at = NOW() WHERE id = ? AND user_id = ?")
      .run(id, ctx.session.userId)
  }
  await showAsset(out, ctx, id, asset.is_closed ? "🔓 Aset dibuka kembali." : "🔒 Aset ditutup.")
}

// ── Hapus aset ───────────────────────────────────────────────────────────────

async function sellCount(id: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS cnt FROM investment_transactions WHERE investment_id = ? AND type = 'SELL'")
    .get(id) as { cnt: number }
  return Number(row.cnt)
}

export async function confirmDeleteAsset(out: Out, ctx: Ctx, id: string): Promise<void> {
  const asset = await loadAsset(ctx, id)
  if (!asset || asset.user_id !== ctx.session.userId) {
    await out.reply("Aset tidak ditemukan atau bukan milik Anda.")
    return
  }
  if ((await sellCount(id)) > 0) {
    await out.reply(
      `⚠️ <b>${escapeHtml(asset.name)}</b> sudah punya transaksi jual, jadi tidak bisa dihapus. Gunakan <b>Tutup aset</b> sebagai gantinya.`,
      [[{ text: "⬅️ Kembali", data: `iv:v:${id}` }]],
    )
    return
  }
  await out.reply(`🗑 Hapus aset <b>${escapeHtml(asset.name)}</b> beserta riwayat transaksinya dari daftar?`, [[
    { text: "✅ Ya, hapus", data: `iv:dy:${id}` },
    { text: "Batal", data: `iv:v:${id}` },
  ]])
}

export async function deleteAsset(out: Out, ctx: Ctx, id: string): Promise<void> {
  const asset = await loadAsset(ctx, id)
  if (!asset || asset.user_id !== ctx.session.userId) {
    await out.reply("Aset tidak ditemukan atau bukan milik Anda.")
    return
  }
  if ((await sellCount(id)) > 0) {
    await out.reply("⚠️ Aset yang sudah punya transaksi jual tidak bisa dihapus.", [[{ text: "⬅️ Kembali", data: `iv:v:${id}` }]])
    return
  }
  await db.prepare("UPDATE investments SET is_active = 0, updated_at = NOW() WHERE id = ? AND user_id = ?")
    .run(id, ctx.session.userId)
  await out.reply(`🗑️ Aset <b>${escapeHtml(asset.name)}</b> dihapus.`, [[{ text: "📋 Semua aset", data: "c:investasi" }]])
}

// ── Hapus transaksi investasi ────────────────────────────────────────────────

async function loadTx(ctx: Ctx, txId: string) {
  return (await db
    .prepare(
      `SELECT it.id, it.investment_id, it.type, it.quantity, it.total_amount, it.date, i.name AS asset_name
         FROM investment_transactions it JOIN investments i ON i.id = it.investment_id
        WHERE it.id = ? AND i.user_id = ? AND i.is_active = 1`,
    )
    .get(txId, ctx.session.userId)) as
    | { id: string; investment_id: string; type: string; quantity: string; total_amount: number; date: string; asset_name: string }
    | undefined
}

export async function confirmDeleteTx(out: Out, ctx: Ctx, txId: string): Promise<void> {
  const tx = await loadTx(ctx, txId)
  if (!tx) {
    await out.reply("Transaksi tidak ditemukan.")
    return
  }
  await out.reply(
    `🗑 Hapus transaksi <b>${TYPE_LABEL[tx.type] ?? tx.type}</b> ${escapeHtml(tx.asset_name)} tanggal ${tx.date} (${formatAmount(Number(tx.total_amount))})?`,
    [[
      { text: "✅ Ya, hapus", data: `iv:qy:${tx.id}` },
      { text: "Batal", data: `iv:v:${tx.investment_id}` },
    ]],
  )
}

export async function deleteTx(out: Out, ctx: Ctx, txId: string): Promise<void> {
  const tx = await loadTx(ctx, txId)
  if (!tx) {
    await out.reply("Transaksi tidak ditemukan (mungkin sudah dihapus).")
    return
  }
  await db.prepare("DELETE FROM investment_transactions WHERE id = ?").run(txId)
  await showAsset(out, ctx, tx.investment_id, "🗑️ Transaksi dihapus.")
}
