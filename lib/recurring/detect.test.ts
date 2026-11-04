import { describe, expect, test } from "bun:test"
import { detectRecurring, matchesPattern, normalizeName, type TxnLike } from "./detect"

let seq = 0
function tx(date: string, amount: number, name = "Listrik", over: Partial<TxnLike> = {}): TxnLike {
  return { id: `t${seq++}`, userId: "u1", kind: "EXPENSE", name, amount, date, categoryId: "c1", walletId: null, ...over }
}
const month = (i: number) => `2026-${String(i).padStart(2, "0")}`

describe("normalizeName", () => {
  test("buang angka, kata umum & nama bulan", () => {
    expect(normalizeName("Bayar listrik 450rb November")).toBe("listrik")
    expect(normalizeName("Tagihan Listrik")).toBe("listrik")
  })
})

describe("detectRecurring", () => {
  test("listrik 450rb tgl 5 selama 6 bulan → 1 pola, confidence tinggi", () => {
    const txns = [1, 2, 3, 4, 5, 6].map((m) => tx(`${month(m)}-05`, 450_000))
    const r = detectRecurring(txns)
    expect(r).toHaveLength(1)
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.85)
    expect(r[0].dayOfMonth).toBe(5)
    expect(r[0].amountAvg).toBe(450_000)
  })

  test("380 dipisah dari 450/460 (selisih 18% > 15%)", () => {
    const r = detectRecurring(
      [tx("2026-01-05", 380_000), tx("2026-02-06", 460_000), tx("2026-03-05", 450_000)],
      { minConfidence: 0.3 },
    )
    expect(r).toHaveLength(1) // 380rb hanya 1 kali → tidak lolos min occurrences
    expect(r[0].amountMin).toBe(450_000)
    expect(r[0].amountMax).toBe(460_000)
  })

  test("belanja acak 12× sebulan → 0 pola", () => {
    const txns: TxnLike[] = []
    for (let m = 1; m <= 6; m++) {
      for (let i = 0; i < 12; i++) {
        txns.push(tx(`${month(m)}-${String(1 + i * 2).padStart(2, "0")}`, 20_000 + ((i * 7919 + m * 104729) % 60_000), "Tokoku"))
      }
    }
    expect(detectRecurring(txns)).toHaveLength(0)
  })

  test("gaji 12jt tgl 25, 12 bulan → pola INCOME confidence ≥ 0.9", () => {
    const txns = Array.from({ length: 12 }, (_, i) =>
      tx(`2026-${String(i + 1).padStart(2, "0")}-25`, 12_000_000, "Gaji", { kind: "INCOME", categoryId: "i1" }),
    )
    const r = detectRecurring(txns)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe("INCOME")
    expect(r[0].confidence).toBeGreaterThanOrEqual(0.9)
  })

  test("2 transaksi identik 2 bulan → tersembunyi default, muncul di 'lihat semua'", () => {
    const txns = [tx("2026-05-10", 300_000, "Iuran"), tx("2026-06-10", 300_000, "Iuran")]
    expect(detectRecurring(txns)).toHaveLength(0)
    const all = detectRecurring(txns, { minConfidence: 0.3 })
    expect(all).toHaveLength(1)
    expect(all[0].confidence).toBeLessThan(0.55)
  })

  test("pola yang sudah lama berhenti tidak diusulkan", () => {
    const txns = [1, 2, 3].map((m) => tx(`${month(m)}-05`, 100_000))
    expect(detectRecurring(txns, { asOfMonth: "2026-10" })).toHaveLength(0)
  })

  test("pemilik berbeda tidak digabung", () => {
    const txns = [
      ...[1, 2, 3].map((m) => tx(`${month(m)}-05`, 100_000, "Listrik", { userId: "a" })),
      ...[1, 2, 3].map((m) => tx(`${month(m)}-05`, 100_000, "Listrik", { userId: "b" })),
    ]
    expect(detectRecurring(txns).map((p) => p.userId).sort()).toEqual(["a", "b"])
  })
})

describe("matchesPattern", () => {
  const p = { kind: "EXPENSE" as const, name: "Listrik", categoryId: "c1", amountAvg: 450_000, amountMin: 440_000, amountMax: 460_000 }
  test("nama sama", () =>
    expect(matchesPattern(p, { kind: "EXPENSE", name: "listrik 455rb", amount: 455_000, categoryId: "c9" })).toBe(true))
  test("kategori sama & nominal mirip", () =>
    expect(matchesPattern(p, { kind: "EXPENSE", name: "PLN token", amount: 460_000, categoryId: "c1" })).toBe(true))
  test("nama & nominal beda", () =>
    expect(matchesPattern(p, { kind: "EXPENSE", name: "Bensin", amount: 50_000, categoryId: "c9" })).toBe(false))
  test("jenis beda", () =>
    expect(matchesPattern(p, { kind: "INCOME", name: "Listrik", amount: 450_000, categoryId: "c1" })).toBe(false))
})
