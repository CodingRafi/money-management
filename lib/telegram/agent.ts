import {
  callGemini,
  functionResponseContent,
  GeminiError,
  type GeminiContent,
  type GeminiPart,
} from "./gemini"
import { executeTelegramTool, telegramTool, todayFromDb, type ToolContext } from "./tools"
import { formatCard, type TxnCard } from "./format"

/** Batas iterasi function calling per pesan (mencegah loop tak berujung). */
const MAX_STEPS = 6

/**
 * Anggaran waktu satu giliran percakapan (ms).
 *
 * Penting: platform tempat webhook berjalan (mis. Vercel) memutus fungsi
 * setelah batas tertentu. Kalau proses AI melewati itu, transaksinya sudah
 * tercatat tetapi balasannya tidak pernah terkirim — user tidak diberi tahu
 * apa pun. Jadi giliran dibatasi agar selalu ada waktu untuk membalas.
 */
const DEFAULT_TURN_BUDGET_MS = Number(process.env.TELEGRAM_AI_BUDGET_MS ?? 40_000)

/**
 * Sisa waktu (ms) yang harus tersedia untuk menjalankan satu panggilan model.
 * Di bawah ini, lebih baik berhenti dan kirim kartu yang sudah ada daripada
 * menunggu model yang belum tentu merespons.
 */
const MIN_REMAINING_MS = 5_000

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
    "11. Kalau pengguna menyebut 'barusan', 'terbaru', atau 'terakhir' untuk revisi/hapus, itu berarti transaksi yang PALING BARU DICATAT — pakai code 'barusan' pada tool revise/delete.",
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
  /**
   * Batas waktu absolut (epoch ms) untuk seluruh giliran ini.
   * Kalau lewat, agent berhenti dan mengembalikan kartu yang sudah tercatat.
   */
  deadline?: number
  /**
   * Dipanggil begitu sebuah transaksi tercatat — dipakai untuk mengirim
   * konfirmasi ke user SEGERA, tanpa menunggu giliran model berikutnya.
   *
   * Ini penting untuk foto struk: proses OCR butuh beberapa kali panggilan
   * model yang lambat, dan kalau prosesnya terpotong di tengah, transaksi
   * sudah masuk database tapi user tidak pernah diberi tahu.
   */
  onCard?: (card: TxnCard) => Promise<void>
}

export interface AgentOutput {
  reply: string
  /** true = `reply` berupa HTML Telegram (kartu) → kirim dengan parse_mode HTML. */
  html?: boolean
  /** Daftar tool yang sempat dipanggil (untuk log/audit). */
  toolsUsed: string[]
  /** true = balasan sudah dikirim lewat `onCard`, jadi `reply` kosong. */
  replied?: boolean
}

/**
 * Jalankan satu giliran percakapan:
 *   pesan pengguna → Gemini → (function call → eksekusi tool → ulangi) → balasan teks.
 */
export async function runTelegramAgent(input: AgentInput): Promise<AgentOutput> {
  // Tanggal default diambil dari jam database — sumber yang sama dengan
  // kolom created_at, sehingga "hari ini" tidak meleset dari data.
  const ctx: ToolContext = { ...input.ctx, today: await todayFromDb() }
  const deadline = input.deadline ?? Date.now() + DEFAULT_TURN_BUDGET_MS
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
  let cardSent = false
  let lastText = ""
  let timedOut = false
  let failure: unknown = null

  for (let step = 0; step < MAX_STEPS; step++) {
    // Sisa waktu tidak cukup untuk satu panggilan model → berhenti.
    if (deadline - Date.now() <= MIN_REMAINING_MS) {
      timedOut = true
      break
    }

    let result
    try {
      result = await callGemini({
        systemInstruction: await buildSystemInstruction(ctx),
        contents,
        tools: [telegramTool],
        deadline,
      })
    } catch (err) {
      // Kalau waktu sudah habis saat panggilan gagal, laporkan sebagai
      // "keburu waktu" (lebih informatif daripada "server sedang sibuk").
      const isQuota = err instanceof GeminiError && err.kind === "quota"
      if (!isQuota && Date.now() >= deadline) {
        timedOut = true
        break
      }
      failure = err
      break
    }

    if (result.text) lastText = result.text

    if (result.functionCalls.length === 0) {
      break
    }

    // Simpan bagian functionCall model, lalu jalankan tool-nya.
    contents.push({ role: "model", parts: result.parts.filter((p) => p.functionCall) })

    let producedCard = false
    for (const call of result.functionCalls) {
      toolsUsed.push(call.name)
      const toolResult = await executeTelegramTool(call.name, call.args ?? {}, ctx)
      if (toolResult.card) {
        cards.push(toolResult.card)
        producedCard = true
        // Kirim konfirmasi ke user SEGERA — jangan tunggu giliran model
        // berikutnya, yang bisa saja tidak pernah selesai.
        if (input.onCard) {
          try {
            await input.onCard(toolResult.card)
            cardSent = true
          } catch (err) {
            console.error("[telegram] gagal mengirim kartu ke user:", err)
          }
        }
      }
      contents.push(
        functionResponseContent(call.name, {
          ok: toolResult.ok,
          message: toolResult.message,
          ...(toolResult.data ?? {}),
        }),
      )
    }

    /*
     * Transaksi sudah dikonfirmasi ke user. Giliran model berikutnya tidak
     * menambah informasi apa pun (balasannya selalu digantikan kartu), tapi
     * bisa memakan 10+ detik — waktu yang precious untuk foto struk.
     */
    if (producedCard) break
  }

  // Model gagal (kuota/busy) — tapi transaksi sudah terkonfirmasi ke user,
  // jadi tidak perlu spam pesan error.
  if (failure) {
    if (cardSent) return { reply: "", replied: true, toolsUsed }
    throw failure
  }

  /*
   * Kalau ada tool yang menghasilkan kartu (mis. pencatatan/revisi transaksi),
   * kirim kartulah ke user — formatnya konsisten dan memuat kode transaksi.
   * Kalimat bebas dari AI tidak ikut ditampilkan supaya tidak membingungkan
   * (mis. nominal yang salah ketik AI).
   */
  if (cards.length > 0) {
    if (cardSent) return { reply: "", replied: true, toolsUsed }
    return {
      reply: cards.map((card) => formatCard(card)).join("\n\n"),
      html: true,
      toolsUsed,
    }
  }

  // Waktu habis sebelum ada transaksi tercatat → beri tahu user.
  if (timedOut) {
    return {
      reply:
        "⏳ Maaf, proses AI terlalu lama sampai lewat batas waktu, jadi catatan ini belum selesai. " +
        "Silakan kirim ulang fotonya (atau tulis nominalnya saja) ya.",
      toolsUsed,
    }
  }

  return {
    reply: lastText.trim() || "Selesai.",
    toolsUsed,
  }
}
