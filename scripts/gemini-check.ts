/**
 * Diagnosa Gemini: model mana yang masih bisa dipakai & status kuota.
 *
 *   bun scripts/gemini-check.ts
 *
 * Berguna saat bot tiba-tiba gagal: bisa langsung cek apakah API key habis
 * kuota atau modelnya sedang sibuk.
 */

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

function loadEnvFile() {
  for (const file of [".env.local", ".env"]) {
    const path = join(process.cwd(), file)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, "utf-8").split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eq = trimmed.indexOf("=")
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = value
    }
  }
}

loadEnvFile()

const API = process.env.GEMINI_API_BASE ?? "https://generativelanguage.googleapis.com/v1beta"
const key = process.env.GEMINI_API_KEY

const MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.5-pro",
  "gemini-3.1-pro-preview",
]

/** PNG 1x1 — dipakai untuk mengecek apakah model menerima gambar (vision/OCR). */
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "create_expense",
        description: "Mencatat pengeluaran",
        parameters: {
          type: "OBJECT",
          properties: { name: { type: "STRING" }, amount: { type: "NUMBER" } },
          required: ["name", "amount"],
        },
      },
    ],
  },
]

interface CheckResult {
  model: string
  status: "OK" | "KUOTA HABIS" | "SIBUK" | "TIDAK ADA" | "ERROR"
  detail: string
}

async function probe(
  model: string,
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; status: number; message: string; payload: any }> {
  try {
    const res = await fetch(`${API}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key ?? "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json().catch(() => null)
    return {
      ok: res.ok,
      status: res.status,
      message: data?.error?.message ?? "",
      payload: data,
    }
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : String(err),
      payload: null,
    }
  }
}

function classify(res: { ok: boolean; status: number; message: string }): CheckResult["status"] {
  if (res.ok) return "OK"
  if (res.status === 0) return "SIBUK"
  if (res.status === 429 || /quota|resource_exhausted/i.test(res.message)) return "KUOTA HABIS"
  if (res.status === 404) return "TIDAK ADA"
  if (res.status >= 500) return "SIBUK"
  return "ERROR"
}

async function main() {
  if (!key) {
    console.error("GEMINI_API_KEY belum diset di .env.local")
    process.exit(1)
  }

  console.log(`Model aktif (env): ${process.env.GEMINI_MODEL ?? "(default)"}\n`)
  console.log("Menguji tiap model…\n")

  const results: CheckResult[] = []

  for (const model of MODELS) {
    const text = await probe(model, {
      contents: [{ role: "user", parts: [{ text: "Jawab 1 kata: rupiah?" }] }],
    })
    const status = classify(text)
    results.push({
      model,
      status,
      detail: status === "OK" ? "text ok" : text.message.slice(0, 60),
    })

    if (status !== "OK") {
      console.log(`${model.padEnd(30)} ${status}`)
      continue
    }

    // Cek function calling & vision untuk model yang lolos.
    const fc = await probe(model, {
      contents: [{ role: "user", parts: [{ text: "makan siang 27rb" }] }],
      tools: TOOLS,
    })
    const hasFunction = fc.payload?.candidates?.[0]?.content?.parts?.some((p: any) => p.functionCall)

    const vision = await probe(model, {
      contents: [
        {
          role: "user",
          parts: [
            { inline_data: { mime_type: "image/png", data: TINY_PNG } },
            { text: "warna gambar?" },
          ],
        },
      ],
    })

    results[results.length - 1].detail =
      `${hasFunction ? "fn-calling ✓" : "fn-calling ✗"} · ${vision.ok ? "vision ✓" : "vision ✗"}`
    console.log(`${model.padEnd(30)} OK  ${results[results.length - 1].detail}`)
  }

  const usable = results.filter((r) => r.status === "OK")
  console.log("")
  if (usable.length === 0) {
    console.log("❌ Tidak ada model yang bisa dipakai.")
    console.log("   Kemungkinan Causes:")
    console.log("   • API key habis kuota free tier → cek https://aistudio.google.com/apikey (Billing)")
    console.log("   • Semua model sedang sibuk → coba lagi nanti")
  } else {
    console.log(`✅ Model yang bisa dipakai: ${usable.map((r) => r.model).join(", ")}`)
    const first = usable[0]
    if (first.model !== (process.env.GEMINI_MODEL ?? "")) {
      console.log("")
      console.log(`💡 Sarangan: set GEMINI_MODEL=${first.model} di .env.local`)
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
