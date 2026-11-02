/**
 * Format output transaksi untuk chat Telegram.
 *
 * Balasan sengaja dibuat dari data server (bukan dari kalimat yang ditulis AI),
 * supaya formatnya konsisten, lengkap, dan bisa langsung dipakai untuk revisi:
 * setiap baris menampilkan ID transaksi + kode singkat yang bisa diketik user.
 */

export interface CardField {
  label: string
  value: string
}

export interface TxnCard {
  /** Judul, mis. "Pengeluaran berhasil ditambahkan". */
  title: string
  /** ID lengkap transaksi di database. */
  id: string
  fields: CardField[]
  /** Baris tambahan di bawah (mis. petunjuk cara revisi). */
  footer?: string
}

/** Kode pendek dari ID transaksi, mis. "0ad968" — diketik user untuk revisi. */
export function shortCode(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()
}

/** Nominal dalam format rupiah yang enak dibaca: "Rp 27.000". */
export function formatAmount(amount: number): string {
  return `Rp ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`
}

/** Nilai kosong ditampilkan sebagai "—". */
export function orDash(value: string | null | undefined): string {
  return value && value.trim() ? value : "—"
}

/**
 * Escape teks agar aman dipakai sebagai HTML di pesan Telegram.
 * WAJIB dipakai untuk semua nilai yang berasal dari user (nama transaksi,
 * catatan, nama kategori…) — kalau tidak, satu karakter `<` bisa membuat
 * seluruh pesan ditolak Telegram.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/**
 * Pecah tanggal "YYYY-MM-DD" menjadi bulan & tahun.
 * HATI-HATI: urutan string adalah tahun-bulan-hari, jadi destructuring-nya
 * dibalik. Fungsi ini dipakai supaya tidak salah baca lagi.
 */
export function monthYear(date: string): { month: number; year: number } {
  const [y, m] = date.split("-").map(Number)
  return { month: m, year: y }
}

export function formatCard(card: TxnCard): string {
  const lines = [`${card.title}:`]
  for (const field of card.fields) {
    lines.push(`${field.label} : ${field.value}`)
  }
  lines.push(`ID : ${card.id}`)
  lines.push(`Kode revisi : ${shortCode(card.id)}`)
  if (card.footer) lines.push(card.footer)
  return lines.join("\n")
}

/**
 * Petunjuk cara memperbaiki transaksi yang keliru.
 * Dipakai di pesan Telegram berformat HTML → tanda kurung sudut harus di-escape.
 */
export const REVISI_HINT = "Salah? kirim: /revisi &lt;kode&gt; &lt;field&gt; &lt;nilai&gt;"
