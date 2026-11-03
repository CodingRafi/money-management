/**
 * Format output transaksi untuk chat Telegram.
 *
 * Balasan sengaja dibuat dari data server (bukan dari kalimat yang ditulis AI),
 * supaya formatnya konsisten, lengkap, dan bisa langsung dipakai untuk revisi:
 * setiap kartu menampilkan kode singkat yang bisa diketik user.
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

/** Ikon per label supaya kartu mudah dipindai; label tak dikenal pakai bullet. */
const FIELD_ICONS: Record<string, string> = {
  "Tanggal": "📅",
  "Tanggal mulai": "📅",
  "Jatuh tempo": "⏰",
  "Jumlah": "💰",
  "Nilai": "💰",
  "Pokok": "💰",
  "Pokok dibayar": "💰",
  "Total dibayar": "💰",
  "Bunga": "📈",
  "Nama / Keterangan": "📝",
  "Wallet sumber": "👛",
  "Dompet asal": "👛",
  "Dompet tujuan": "👛",
  "Kategori": "🏷️",
  "Batas anggaran": "🎯",
  "Sisa anggaran": "💰",
  "Kelebihan anggaran": "🚨",
  "Status anggaran": "🚦",
  "Jenis Kebutuhan": "🎯",
  "Catat sebagai pengeluaran keluarga": "👨‍👩‍👧",
  "Pinjaman": "🤝",
  "Aset": "📊",
  "Jenis": "🔁",
  "Satuan": "📦",
  "Catatan": "🗒️",
}

/** Pemisah antar kartu kalau satu balasan memuat lebih dari satu. */
export const CARD_DIVIDER = "\n\n━━━━━━━━━━━━\n\n"

/**
 * Kartu transaksi dalam HTML Telegram (kirim dengan parse_mode HTML).
 * Setiap bagian dipisah baris kosong supaya tidak terasa mepet:
 * judul · rincian · kode transaksi · petunjuk. Nilai dari user sudah di-escape
 * oleh pembuat kartu (cards.ts).
 */
export function formatCard(card: TxnCard): string {
  const details = card.fields
    .map((f) => `${FIELD_ICONS[f.label] ?? "▫️"} ${f.label}: <b>${f.value}</b>`)
    .join("\n")
  const parts = [
    `✅ <b>${card.title}</b>`,
    details,
    `🔖 Kode transaksi: <code>${shortCode(card.id)}</code>`,
  ]
  if (card.footer) parts.push(card.footer)
  return parts.join("\n\n")
}

/**
 * Petunjuk cara memperbaiki transaksi yang keliru, dengan kode transaksi sudah
 * terisi. Dibungkus <code> supaya cukup diketuk di Telegram untuk menyalinnya;
 * user tinggal mengganti <field> dan <nilai>. Dipakai di pesan berformat HTML
 * → tanda kurung sudut harus di-escape.
 */
export function revisiHint(id: string): string {
  const code = shortCode(id)
  return [
    "<blockquote>Salah? Ketuk untuk salin, lalu ganti field &amp; nilainya:",
    `<code>/revisi ${code} &lt;field&gt; &lt;nilai&gt;</code>`,
    "",
    "Field: jumlah · nama · tanggal · kategori · wallet",
    `Contoh: <code>/revisi ${code} jumlah 30rb</code>`,
    "Atau tanpa kode: <code>/revisi barusan</code></blockquote>",
  ].join("\n")
}
