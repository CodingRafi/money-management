import type { PricePoint } from "./types"

/**
 * Angka gaya Indonesia/Inggris: "4.250" → 4250, "4.250,50" → 4250.5,
 * "4250.5" → 4250.5. Satu pemisah dengan tepat 3 digit di belakangnya (atau
 * muncul berulang) dianggap pemisah ribuan.
 */
export function parsePriceNumber(raw: string): number {
  if (/^\s*-/.test(raw)) return -Math.abs(parsePriceNumber(raw.replace(/^\s*-/, "")))
  const s = raw.trim().replace(/[^\d.,]/g, "")
  if (!s) return NaN
  const dot = s.lastIndexOf(".")
  const com = s.lastIndexOf(",")
  if (dot >= 0 && com >= 0) {
    const dec = dot > com ? "." : ","
    const thou = dec === "." ? "," : "."
    return Number(s.split(thou).join("").replace(dec, "."))
  }
  const sep = dot >= 0 ? "." : com >= 0 ? "," : null
  if (!sep) return Number(s)
  const count = s.split(sep).length - 1
  const tail = s.length - s.lastIndexOf(sep) - 1
  return count > 1 || tail === 3 ? Number(s.split(sep).join("")) : Number(s.replace(sep, "."))
}

const LINE_RE = /^(\d{4}-\d{2}-\d{2})[\s,;]+(.+)$/

/**
 * Parse teks tempel/CSV "tanggal,harga" per baris (baris header diabaikan).
 * Baris tak valid dikembalikan di `errors` — tidak dibuang diam-diam.
 */
export function parsePriceCsv(text: string): { points: PricePoint[]; errors: string[] } {
  const points: PricePoint[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim()
    if (!t) return
    const m = LINE_RE.exec(t)
    if (!m) {
      if (i > 0) errors.push(`Baris ${i + 1}: "${t.slice(0, 40)}"`)
      return
    }
    const price = parsePriceNumber(m[2])
    if (!Number.isFinite(price) || price <= 0 || Number.isNaN(Date.parse(m[1]))) {
      errors.push(`Baris ${i + 1}: "${t.slice(0, 40)}"`)
      return
    }
    points.push({ date: m[1], close: price })
  })
  return { points, errors }
}
