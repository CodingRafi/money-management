/** Helper tampilan (aman dipakai di server & client). Input desimal → teks. */

export function rp(v: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v)
}

export function short(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e12) return `${(v / 1e12).toFixed(1)}T`
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}M`
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}jt`
  if (a >= 1e3) return `${(v / 1e3).toFixed(0)}rb`
  return String(Math.round(v))
}

export function pct(v: number | null | undefined, digits = 1): string {
  return v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`
}

export function num(v: number | null | undefined, digits = 2): string {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(digits)
}

export function monthLabel(date: string): string {
  const [y, m] = date.split("-")
  const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
  return `${names[Number(m) - 1] ?? m} ${y.slice(2)}`
}
