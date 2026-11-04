import { classifyAsset } from "@/lib/risk/stress"

export type SimAssetOption = { id: string; name: string; category: string; months: number }
export type WeightMap = Record<string, number> // investmentId → persen (0..100)

export type Preset = { key: string; label: string; build: (assets: SimAssetOption[], current: WeightMap) => WeightMap }

function equal(ids: string[]): WeightMap {
  const out: WeightMap = {}
  ids.forEach((id) => (out[id] = Math.round((100 / ids.length) * 100) / 100))
  return out
}

/** Bagi `total` persen merata ke ids (selisih pembulatan masuk ke aset pertama). */
function split(ids: string[], total: number, into: WeightMap) {
  if (!ids.length) return
  const each = Math.floor((total / ids.length) * 100) / 100
  ids.forEach((id, i) => (into[id] = i === 0 ? Math.round((total - each * (ids.length - 1)) * 100) / 100 : each))
}

export const PRESETS: Preset[] = [
  { key: "equal", label: "Bobot rata", build: (a) => equal(a.map((x) => x.id)) },
  {
    key: "current",
    label: "Sesuai portofolio sekarang",
    build: (a, cur) => {
      const ids = a.map((x) => x.id).filter((id) => (cur[id] ?? 0) > 0)
      const sum = ids.reduce((s, id) => s + cur[id], 0)
      const out: WeightMap = {}
      ids.forEach((id) => (out[id] = Math.round((cur[id] / sum) * 10000) / 100))
      return out
    },
  },
  {
    key: "growth",
    label: "Saham 70 / lainnya 30",
    build: (a) => {
      const eq = a.filter((x) => classifyAsset(x.category) === "EQUITY").map((x) => x.id)
      const rest = a.filter((x) => classifyAsset(x.category) !== "EQUITY").map((x) => x.id)
      const out: WeightMap = {}
      if (!eq.length || !rest.length) return equal(a.map((x) => x.id))
      split(eq, 70, out)
      split(rest, 30, out)
      return out
    },
  },
  {
    key: "defensive",
    label: "Defensif (saham 30)",
    build: (a) => {
      const eq = a.filter((x) => classifyAsset(x.category) === "EQUITY").map((x) => x.id)
      const rest = a.filter((x) => classifyAsset(x.category) !== "EQUITY").map((x) => x.id)
      const out: WeightMap = {}
      if (!eq.length || !rest.length) return equal(a.map((x) => x.id))
      split(eq, 30, out)
      split(rest, 70, out)
      return out
    },
  },
]

// ── State URL: ?cap=&contrib=&years=&alloc=id:50,id2:50&bench=&reb= ───────────

export type UrlState = {
  cap?: number
  contrib?: number
  years?: number
  alloc?: WeightMap
  bench?: string
  reb?: string
}

export function parseUrlState(sp: Record<string, string | string[] | undefined>): UrlState {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined)
  const numOf = (k: string) => {
    const v = Number(one(k))
    return one(k) && Number.isFinite(v) && v >= 0 ? v : undefined
  }
  let alloc: WeightMap | undefined
  const a = one("alloc")
  if (a) {
    alloc = {}
    for (const part of a.split(",")) {
      const [id, w] = part.split(":")
      const wn = Number(w)
      if (id && Number.isFinite(wn) && wn >= 0) alloc[id] = wn
    }
  }
  const reb = one("reb")
  return {
    cap: numOf("cap"),
    contrib: numOf("contrib"),
    years: numOf("years"),
    alloc,
    bench: one("bench"),
    reb: reb && ["NONE", "MONTHLY", "QUARTERLY", "ANNUAL"].includes(reb) ? reb : undefined,
  }
}

export function toQuery(s: { cap: number; contrib: number; years: number; alloc: WeightMap; bench: string; reb: string }): string {
  const p = new URLSearchParams()
  p.set("cap", String(s.cap))
  p.set("contrib", String(s.contrib))
  p.set("years", String(s.years))
  const alloc = Object.entries(s.alloc).filter(([, w]) => w > 0).map(([id, w]) => `${id}:${w}`).join(",")
  if (alloc) p.set("alloc", alloc)
  if (s.bench) p.set("bench", s.bench)
  p.set("reb", s.reb)
  return p.toString()
}
