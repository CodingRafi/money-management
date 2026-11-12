/**
 * Parser periode bersama untuk perintah bot Telegram (/rekap, /riwayat, dst).
 *
 * Satu parser dipakai semua perintah supaya cara menulis periodenya sama:
 *   hari ini · kemarin · 3 hari lalu · 7 hari terakhir · minggu ini
 *   bulan ini · bulan lalu · tahun ini · tahun lalu
 *   2026 · 2026-11 · 11 · november · november 2026 · bulan 10
 *   2026-11-05 · 05/11 · 05-11-2026 · 5 november · tanggal 15
 *
 * Periode boleh ditaruh di awal ATAU di akhir argumen; sisanya dikembalikan
 * sebagai `rest` (mis. kata kunci pencarian).
 */

export type PeriodKind = "day" | "range" | "month" | "year"

export interface Period {
  kind: PeriodKind
  /** Batas bawah/atas "YYYY-MM-DD" (inklusif). */
  from: string
  to: string
  /** Label ramah untuk judul laporan, mis. "November 2026". */
  label: string
  year: number
  /** 1-12; hanya terisi untuk kind "month" dan "day". */
  month?: number
}

export interface ParsedPeriod {
  period: Period | null
  /** Sisa argumen setelah periode dibuang. */
  rest: string
}

const MONTH_NAMES = [
  "januari", "februari", "maret", "april", "mei", "juni",
  "juli", "agustus", "september", "oktober", "november", "desember",
]

const MONTH_LABELS = MONTH_NAMES.map((m) => m[0].toUpperCase() + m.slice(1))

/** Nama bulan (lengkap & singkatan umum) → nomor bulan 1-12. */
const MONTH_LOOKUP: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  MONTH_NAMES.forEach((name, i) => {
    map[name] = i + 1
    map[name.slice(0, 3)] = i + 1
  })
  Object.assign(map, { agt: 8, agu: 8, okt: 10, des: 12, sept: 9, juni: 6, juli: 7 })
  return map
})()

const pad = (n: number) => String(n).padStart(2, "0")

function shiftDate(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Tanggal "YYYY-MM-DD" yang valid (menolak mis. 31 Februari), atau null. */
function validDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return `${d} ${MONTH_LABELS[m - 1]} ${y}`
}

function dayPeriod(date: string, label?: string): Period {
  const [y, m] = date.split("-").map(Number)
  return { kind: "day", from: date, to: date, label: label ?? formatDay(date), year: y, month: m }
}

function monthPeriod(year: number, month: number): Period | null {
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null
  return {
    kind: "month",
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    label: `${MONTH_LABELS[month - 1]} ${year}`,
    year,
    month,
  }
}

function yearPeriod(year: number): Period | null {
  if (year < 2000 || year > 2100) return null
  return { kind: "year", from: `${year}-01-01`, to: `${year}-12-31`, label: `Tahun ${year}`, year }
}

/**
 * Cocokkan SATU frasa periode (tanpa sisa kata). `allowBare` mengizinkan angka
 * telanjang ("11", "2026", "15") — hanya aman bila itu satu-satunya argumen,
 * karena di tempat lain angka bisa berarti hal lain (mis. nominal).
 */
function matchPhrase(phrase: string, today: string, allowBare: boolean): Period | null {
  const [ty, tm] = today.split("-").map(Number)
  let m: RegExpExecArray | null

  if (phrase === "hari ini" || phrase === "today") return dayPeriod(today, `Hari ini (${formatDay(today)})`)
  if (phrase === "kemarin" || phrase === "yesterday") return dayPeriod(shiftDate(today, -1), `Kemarin (${formatDay(shiftDate(today, -1))})`)
  if (phrase === "kemarin lusa" || phrase === "lusa kemarin") return dayPeriod(shiftDate(today, -2))

  if ((m = /^(\d{1,3}) hari (?:yang )?lalu$/.exec(phrase))) return dayPeriod(shiftDate(today, -Number(m[1])))

  if ((m = /^(\d{1,3}) hari terakhir$/.exec(phrase))) {
    const n = Math.min(366, Math.max(1, Number(m[1])))
    return { kind: "range", from: shiftDate(today, -(n - 1)), to: today, label: `${n} hari terakhir`, year: ty }
  }
  if (phrase === "minggu ini" || phrase === "seminggu terakhir") {
    return { kind: "range", from: shiftDate(today, -6), to: today, label: "7 hari terakhir", year: ty }
  }

  if (phrase === "bulan ini") return monthPeriod(ty, tm)
  if (phrase === "bulan lalu" || phrase === "last bulan") {
    return tm === 1 ? monthPeriod(ty - 1, 12) : monthPeriod(ty, tm - 1)
  }
  if (phrase === "tahun ini") return yearPeriod(ty)
  if (phrase === "tahun lalu") return yearPeriod(ty - 1)
  if (phrase === "tahun") return yearPeriod(ty)

  // Tanggal lengkap: YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DD/MM
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(phrase))) {
    const d = validDate(Number(m[1]), Number(m[2]), Number(m[3]))
    return d ? dayPeriod(d) : null
  }
  if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(phrase))) {
    const d = validDate(Number(m[3]), Number(m[2]), Number(m[1]))
    return d ? dayPeriod(d) : null
  }
  if ((m = /^(\d{1,2})[/.](\d{1,2})$/.exec(phrase))) {
    const d = validDate(ty, Number(m[2]), Number(m[1]))
    return d ? dayPeriod(d) : null
  }
  // Bulan: YYYY-MM
  if ((m = /^(\d{4})-(\d{1,2})$/.exec(phrase))) return monthPeriod(Number(m[1]), Number(m[2]))

  // "tanggal 15" / "tgl 15" → tanggal itu pada bulan berjalan
  if ((m = /^(?:tanggal|tgl) (\d{1,2})$/.exec(phrase))) {
    const d = validDate(ty, tm, Number(m[1]))
    return d ? dayPeriod(d) : null
  }
  // "5 november" / "5 november 2026"
  if ((m = /^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/.exec(phrase)) && MONTH_LOOKUP[m[2]]) {
    const d = validDate(m[3] ? Number(m[3]) : ty, MONTH_LOOKUP[m[2]], Number(m[1]))
    return d ? dayPeriod(d) : null
  }
  // "bulan 10" / "bulan 10 2026" / "bulan november"
  if ((m = /^bulan (\d{1,2})(?: (\d{4}))?$/.exec(phrase))) {
    return monthPeriod(m[2] ? Number(m[2]) : ty, Number(m[1]))
  }
  if ((m = /^bulan ([a-z]+)(?: (\d{4}))?$/.exec(phrase)) && MONTH_LOOKUP[m[1]]) {
    return monthPeriod(m[2] ? Number(m[2]) : ty, MONTH_LOOKUP[m[1]])
  }
  // "november" / "november 2026"
  if ((m = /^([a-z]+)(?: (\d{4}))?$/.exec(phrase)) && MONTH_LOOKUP[m[1]]) {
    return monthPeriod(m[2] ? Number(m[2]) : ty, MONTH_LOOKUP[m[1]])
  }
  // "tahun 2026"
  if ((m = /^tahun (\d{4})$/.exec(phrase))) return yearPeriod(Number(m[1]))

  if (allowBare) {
    if ((m = /^(\d{4})$/.exec(phrase))) return yearPeriod(Number(m[1]))
    if ((m = /^(\d{1,2})$/.exec(phrase))) {
      const n = Number(m[1])
      if (n >= 1 && n <= 12) return monthPeriod(ty, n)
      const d = validDate(ty, tm, n)
      return d ? dayPeriod(d) : null
    }
  }
  return null
}

/**
 * Ambil periode dari argumen perintah. Frasa terpanjang (maks 4 kata) yang
 * cocok dipilih; yang paling kiri menang bila ada beberapa.
 */
export function extractPeriod(arg: string, today: string): ParsedPeriod {
  const tokens = arg.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { period: null, rest: "" }

  // Seluruh argumen berupa satu angka → boleh dibaca sebagai bulan/tanggal/tahun.
  const whole = matchPhrase(tokens.join(" "), today, true)
  if (whole) return { period: whole, rest: "" }

  for (let start = 0; start < tokens.length; start++) {
    for (let len = Math.min(4, tokens.length - start); len >= 1; len--) {
      const phrase = tokens.slice(start, start + len).join(" ")
      const period = matchPhrase(phrase, today, false)
      if (period) {
        // Gunakan teks asli (huruf besar/kecil) untuk sisa kata kunci.
        const original = arg.trim().split(/\s+/).filter(Boolean)
        const rest = [...original.slice(0, start), ...original.slice(start + len)].join(" ")
        return { period, rest }
      }
    }
  }
  return { period: null, rest: arg.trim() }
}

/** Periode default bila user tidak menyebut apa pun: bulan berjalan. */
export function currentMonth(today: string): Period {
  const [y, m] = today.split("-").map(Number)
  return monthPeriod(y, m)!
}

/** Teks bantuan format periode — dipakai di pesan bantuan & pesan salah format. */
export const PERIOD_HELP =
  "hari ini · kemarin · 3 hari lalu · 7 hari terakhir · bulan ini · bulan lalu · tahun ini · " +
  "november · 2026-11 · 2026 · 05/11 · 5 november"

/** Bentuk teks periode yang bisa diparse ulang — dipakai untuk data tombol. */
export function periodArg(p: Period): string {
  if (p.kind === "day") return p.from
  if (p.kind === "month") return `${p.year}-${pad(p.month!)}`
  if (p.kind === "year") return `tahun ${p.year}`
  return p.label
}

/**
 * Periode sebelum (-1) atau sesudah (+1) periode ini, untuk tombol ◀ ▶.
 * Mengembalikan null untuk rentang bebas, atau bila hasilnya di masa depan.
 */
export function shiftPeriod(p: Period, dir: -1 | 1, today: string): Period | null {
  let next: Period | null = null
  if (p.kind === "day") {
    next = dayPeriod(shiftDate(p.from, dir))
  } else if (p.kind === "month") {
    const idx = p.year * 12 + (p.month! - 1) + dir
    next = monthPeriod(Math.floor(idx / 12), (idx % 12) + 1)
  } else if (p.kind === "year") {
    next = yearPeriod(p.year + dir)
  }
  if (!next || next.from > today) return null
  return next
}
