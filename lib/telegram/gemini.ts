/**
 * Klien Gemini (Google Generative Language API) via REST.
 *
 * Tanpa SDK: yang dipakai hanya `generateContent` dengan function calling
 * dan inline image (untuk OCR struk). Format request/response mengikuti
 * https://ai.google.dev/api/generate-content
 *
 * Catatan ketahanan:
 *   * Setiap percobaan dibatasi timeout, supaya chat tidak menggantung.
 *   * Model Gemini-flash kadang kena lonjakan permintaan (503 / timeout).
 *     Karena itu ada retry singkat lalu pindah ke model cadangan.
 */

const API_BASE = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta"

/**
 * Model utama.
 *
 * Catatan kuota: free tier Gemini membatasi jumlah request per hari (dulu
 * 20 request/hari untuk model flash). Model "lite" punya kuota terpisah,
 * jadi dipakai sebagai model utama — lebih hemat dan tahan limit.
 * Bisa diganti lewat env `GEMINI_MODEL`.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"

/**
 * Model cadangan, dicoba berurutan bila model utama gagal.
 * Urutan: model lite lain → model flash (kuotanya terpisah dari lite).
 */
const FALLBACK_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
]

const ATTEMPT_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 40_000)
const MAX_ATTEMPTS_PER_MODEL = 2

/**
 * Error yangamar— dipisah supaya pesan ke user bisa spesifik:
 *   * quota  → API key habis kuota (perbaiki di billing, retry tidak menolong)
 *   * busy   → model sedang kena lonjakan permintaan (coba model lain)
 *   * fatal  → permintaan memang salah (tidak perlu dicoba ulang)
 */
export type GeminiErrorKind = "quota" | "busy" | "fatal"

export class GeminiError extends Error {
  kind: GeminiErrorKind
  model: string
  constructor(message: string, kind: GeminiErrorKind, model: string) {
    super(message)
    this.kind = kind
    this.model = model
  }
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
}

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY belum diset")
  return key
}

// ── Tipe payload ─────────────────────────────────────────────────────────────

export interface GeminiFunctionCall {
  name: string
  args: Record<string, unknown>
}

export interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
  functionCall?: GeminiFunctionCall
  functionResponse?: { name: string; response: Record<string, unknown> }
}

export interface GeminiContent {
  role: "user" | "model"
  parts: GeminiPart[]
}

export interface GeminiTool {
  functionDeclarations: {
    name: string
    description: string
    parameters: GeminiSchema
  }[]
}

export interface GeminiSchema {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN"
  description?: string
  properties?: Record<string, GeminiSchema>
  items?: GeminiSchema
  enum?: string[]
  required?: string[]
  nullable?: boolean
}

// ── Error ────────────────────────────────────────────────────────────────────

class GeminiRequestError extends Error {
  retryable: boolean
  kind: GeminiErrorKind
  model: string
  constructor(message: string, retryable: boolean, kind: GeminiErrorKind, model: string) {
    super(message)
    this.retryable = retryable
    this.kind = kind
    this.model = model
  }
}

// ── Panggil API ──────────────────────────────────────────────────────────────

export interface GeminiResult {
  parts: GeminiPart[]
  /** Semua teks yang dihasilkan model (bisa lebih dari satu part). */
  text: string
  functionCalls: GeminiFunctionCall[]
  /** Alasan model berhenti (mis. Safety / max token). */
  finishReason?: string
}

async function callOnce(model: string, opts: {
  systemInstruction: string
  contents: GeminiContent[]
  tools?: GeminiTool[]
}): Promise<GeminiResult> {
  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: opts.systemInstruction }] },
    contents: opts.contents,
  }
  if (opts.tools?.length) body.tools = opts.tools

  let res: Response
  try {
    res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": getGeminiApiKey(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Timeout / koneksi putus → layak dicoba lagi.
    throw new GeminiRequestError(`Gemini tidak merespons (${model}): ${msg}`, true, "busy", model)
  }

  const data = (await res.json().catch(() => null)) as
    | {
        candidates?: {
          content?: { parts?: GeminiPart[] }
          finishReason?: string
        }[]
        promptFeedback?: { blockReason?: string }
        error?: { message?: string }
      }
    | null

  if (!res.ok || data?.error) {
    const message = data?.error?.message ?? `HTTP ${res.status}`

    if (res.status === 429 || /quota|rate limit|resource_exhausted/i.test(message)) {
      // Kuota habis → mencoba model lain tidak menolong (semua pakai key yang sama).
      throw new GeminiRequestError(
        `Kuota API Gemini habis: ${message}`,
        false,
        "quota",
        model,
      )
    }
    if (res.status >= 500) {
      // 5xx = gangguan sementara → coba lagi / model lain.
      throw new GeminiRequestError(`Gemini API gagal (${model}): ${message}`, true, "busy", model)
    }
    // 4xx lain = permintaan memang salah.
    throw new GeminiRequestError(`Gemini API gagal (${model}): ${message}`, false, "fatal", model)
  }
  if (data?.promptFeedback?.blockReason) {
    throw new GeminiRequestError(`Gemini memblokir permintaan: ${data.promptFeedback.blockReason}`, false, "fatal", model)
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? []
  const functionCalls: GeminiFunctionCall[] = []
  let text = ""
  for (const part of parts) {
    if (part.functionCall) functionCalls.push(part.functionCall)
    if (part.text) text += part.text
  }

  return { parts, text, functionCalls, finishReason: data?.candidates?.[0]?.finishReason }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function callGemini(opts: {
  systemInstruction: string
  contents: GeminiContent[]
  tools?: GeminiTool[]
}): Promise<GeminiResult> {
  const primary = getGeminiModel()
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)]

  let lastError: GeminiRequestError | undefined

  for (const model of models) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_MODEL; attempt++) {
      try {
        return await callOnce(model, opts)
      } catch (err) {
        const e = err instanceof GeminiRequestError
          ? err
          : new GeminiRequestError(err instanceof Error ? err.message : String(err), false, "fatal", model)
        lastError = e

        // Kuota habis → berhenti di sini. Model lain memakai key yang sama,
        // jadi tidak akan lebih baik.
        if (e.kind === "quota") throw new GeminiError(e.message, "quota", model)

        // Model utama boleh dicoba 2x; model cadangan cukup 1x agar tidak
        // menunggu terlalu lama.
        const maxAttempts = model === primary ? MAX_ATTEMPTS_PER_MODEL : 1
        if (!e.retryable || attempt >= maxAttempts) break
        await sleep(1500 * attempt)
      }
    }
  }

  throw new GeminiError(
    lastError?.message ?? "Gemini API gagal",
    lastError?.kind ?? "busy",
    lastError?.model ?? primary,
  )
}

/** Bantu menyusun balasan functionResponse untuk iterasi function calling. */
export function functionResponseContent(
  name: string,
  response: Record<string, unknown>,
): GeminiContent {
  return { role: "user", parts: [{ functionResponse: { name, response } }] }
}
