import { describe, expect, test } from "bun:test"
import { parsePriceCsv, parsePriceNumber } from "./manual"

describe("parsePriceNumber", () => {
  test("format Indonesia & Inggris", () => {
    expect(parsePriceNumber("4.250")).toBe(4250)
    expect(parsePriceNumber("4.250,50")).toBe(4250.5)
    expect(parsePriceNumber("4,250.5")).toBe(4250.5)
    expect(parsePriceNumber("4250.5")).toBe(4250.5)
    expect(parsePriceNumber("Rp 1.250.000")).toBe(1250000)
    expect(parsePriceNumber("abc")).toBeNaN()
  })
})

describe("parsePriceCsv", () => {
  test("header diabaikan, baris salah dilaporkan", () => {
    const r = parsePriceCsv("date,close\n2024-01-31,4250\n2024-02-29;4.390\nngawur\n2024-03-31,-5")
    expect(r.points).toEqual([{ date: "2024-01-31", close: 4250 }, { date: "2024-02-29", close: 4390 }])
    expect(r.errors.length).toBe(2)
  })
})
