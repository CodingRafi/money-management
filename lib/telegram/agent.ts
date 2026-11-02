import {
  callGemini,
  functionResponseContent,
  type GeminiContent,
  type GeminiPart,
} from "./gemini"
import { executeTelegramTool, telegramTool, todayFromDb, type ToolContext } from "./tools"
import { CARD_DIVIDER, formatCard, type TxnCard } from "./format"

/** Batas iterasi function calling per pesan (mencegah loop tak berujung). */
const MAX_STEPS = 6

export async function buildSystemInstruction(ctx: ToolContext): Promise<string> {
  const now = new Date(`${ctx.today}T00:00:00Z`)
  const hari = now.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta",
  })

  return [
    "Kamu adalah asisten pencatat keuangan pribadi untuk aplikasi \"Money Management\".",
    "Pengguna chatting lewat Telegram dan ingin datanya dicatat ke aplikasi.",
    "",
    `Pengguna: ${ctx.session.username}.`,
    `Peran dalam keluarga: ${ctx.session.householdRole ?? "member"}.`,
    `Hari ini (WIB): ${hari} = ${ctx.today}.`,
    `TANGGAL DEFAULT untuk transaksi = ${ctx.today}.`,
    "",
    "ATURAN WAJIB:",
    "1. Selalu pakai tool untuk menulis data. Jangan mengarang hasil — kalau data belum ada, panggil tool untuk mengambilnya.",
    "2. Kalau pengguna menyebut kategori/dompet/aset dengan nama (bukan id), panggil tool list_* yang relevan lalu pakai id-nya.",
    "3. Nominal dalam rupiah. Parse shorthand: '25rb' = 25000, '1,5jt' = 1500000, '2jt500' = 2500000, '50k' = 50000.",
    "4. Tanggal: pakai tanggal default di atas, KECUALI pengguna menyebut tanggal lain. Jangan menebak tanggal dari pengetahuanmu sendiri.",
    "5. Kalau informasi penting tidak ada (mis. kategori tidak bisa dipastikan), TANYA user dalam bahasa Indonesia — jangan menebak-nebak.",
    "6. Setelah tool berhasil, balas singkat dan informatif: apa yang tercatat, nominal, tanggal, dan kategori. Kalau gagal, jelaskan alasannya.",
    "7. Jangan gunakan tool hapus (delete_*) kecuali pengguna secara eksplisit meminta menghapus/membatalkan transaksi tertentu.",
    "8. Kalau pengguna mengirim foto struk, baca nominal, nama merchant, tanggal, dan kategori dari struk tersebut lalu catat sebagai pengeluaran.",
    "9. Balas dalam bahasa Indonesia, singkat (maksimal 3-4 kalimat), tanpa markdown tebal berlebihan.",
    "10. Jangan mengarang hal yang tidak ada di data — kalau tidak tahu, katakan tidak tahu.",
  ].join("\n")
}

export interface AgentInput {
  ctx: Omit<ToolContext, "today">
  /** Isi pesan pengguna (teks). */
  text: string
  /** Gambar (struk) bila ada — dipakai untuk OCR oleh model vision. */
  image?: { mimeType: string; base64: string }
  /** Riwayat percakapan sebelumnya (kronologi). */
  history?: GeminiContent[]
}

export interface AgentOutput {
  reply: string
  /** true = `reply` berupa HTML Telegram (kartu) → kirim dengan parse_mode HTML. */
  html?: boolean
  /** Daftar tool yang sempat dipanggil (untuk log/audit). */
  toolsUsed: string[]
}

/**
 * Jalankan satu giliran percakapan:
 *   pesan pengguna → Gemini → (function call → eksekusi tool → ulangi) → balasan teks.
 */
export async function runTelegramAgent(input: AgentInput): Promise<AgentOutput> {
  // Tanggal default diambil dari jam database — sumber yang sama dengan
  // kolom created_at, sehingga "hari ini" tidak meleset dari data.
  const ctx: ToolContext = { ...input.ctx, today: await todayFromDb() }
  const contents: GeminiContent[] = [...(input.history ?? [])]

  const userParts: GeminiPart[] = []
  if (input.image) {
    userParts.push({
      inline_data: { mime_type: input.image.mimeType, data: input.image.base64 },
    })
  }
  userParts.push({ text: input.text || (input.image ? "Tolong catat struk ini." : "") })
  contents.push({ role: "user", parts: userParts })

  const toolsUsed: string[] = []
  const cards: TxnCard[] = []
  let lastText = ""

  for (let step = 0; step < MAX_STEPS; step++) {
    const result = await callGemini({
      systemInstruction: await buildSystemInstruction(ctx),
      contents,
      tools: [telegramTool],
    })

    if (result.text) lastText = result.text

    if (result.functionCalls.length === 0) {
      break
    }

    // Simpan bagian functionCall model, lalu jalankan tool-nya.
    contents.push({ role: "model", parts: result.parts.filter((p) => p.functionCall) })

    for (const call of result.functionCalls) {
      toolsUsed.push(call.name)
      const toolResult = await executeTelegramTool(call.name, call.args ?? {}, ctx)
      if (toolResult.card) cards.push(toolResult.card)
      contents.push(
        functionResponseContent(call.name, {
          ok: toolResult.ok,
          message: toolResult.message,
          ...(toolResult.data ?? {}),
        }),
      )
    }
  }

  /*
   * Kalau ada tool yang menghasilkan kartu (mis. pencatatan/revisi transaksi),
   * kirim kartulah ke user — formatnya konsisten dan memuat kode transaksi.
   * Kalimat bebas dari AI tidak ikut ditampilkan supaya tidak membingungkan
   * (mis. nominal yang salah ketik AI).
   */
  if (cards.length > 0) {
    return {
      reply: cards.map((card) => formatCard(card)).join("\n\n"),
      toolsUsed,
    }
  }

  return {
    reply: lastText.trim() || "Selesai.",
    toolsUsed,
  }
}
