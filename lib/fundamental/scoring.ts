// Helper skoring bersama untuk kalkulator fundamental

/** Skala: nilai batas [buruk, cukup, baik, sangat baik] → skor 0, 35, 65, 95 */
export type Scale = { dir: "higher" | "lower"; pts: [number, number, number, number] }

export function scale(dir: "higher" | "lower", pts: [number, number, number, number]): Scale {
  return { dir, pts }
}

export const SCORE_AT = [0, 35, 65, 95] as const

export function interpolate(v: number, s: Scale): number {
  const p = s.pts
  if (s.dir === "higher") {
    if (v <= p[0]) return 0
    if (v >= p[3]) return 100
    for (let i = 0; i < 3; i++) {
      if (v <= p[i + 1]) return SCORE_AT[i] + ((v - p[i]) / (p[i + 1] - p[i])) * (SCORE_AT[i + 1] - SCORE_AT[i])
    }
    return 100
  }
  // lower: titik batas menurun (buruk → bagus), makin kecil makin baik
  if (v >= p[0]) return 0
  if (v <= p[3]) return 100
  for (let i = 0; i < 3; i++) {
    if (v >= p[i + 1]) return SCORE_AT[i] + ((p[i] - v) / (p[i] - p[i + 1])) * (SCORE_AT[i + 1] - SCORE_AT[i])
  }
  return 100
}

/** Current ratio ideal di 1.5–2.5; terlalu rendah atau terlalu tinggi sama-sama dikurangi. */
export function currentRatioScore(v: number): number {
  if (v >= 1.5 && v <= 2.5) return 100
  if (v < 1.5) return Math.max(0, ((v - 0.5) / 1.0) * 100)
  return Math.max(30, 100 - (v - 2.5) * 20)
}

export const safeDiv = (a: number, b: number, fallback = 0) => (b === 0 || !isFinite(b) || !isFinite(a) ? fallback : a / b)
export const clamp = (v: number) => Math.max(0, Math.min(100, v))

