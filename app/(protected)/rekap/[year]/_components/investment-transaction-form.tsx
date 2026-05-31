"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface Props {
  wallets: { id: string; name: string }[]
  goals: { id: string; name: string; color: string | null }[]
  action: (formData: FormData) => Promise<void>
  cancelHref: string
  year: number
  unit?: string | null
}

export function InvestmentTransactionForm({ wallets, goals, action, cancelHref, year, unit }: Props) {
  const [type, setType]               = useState<"BUY" | "SELL">("BUY")
  const [quantity, setQuantity]       = useState("")
  const [pricePerUnit, setPricePerUnit] = useState("")

  const total    = parseFloat(quantity) * parseFloat(pricePerUnit)
  const hasTotal = !isNaN(total) && total > 0

  const today = new Date()
  const defaultDate =
    today.getFullYear() === year
      ? today.toISOString().split("T")[0]
      : `${year}-01-01`

  const formatRupiah = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />

      {/* Type toggle */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Tipe Transaksi</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setType("BUY")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              type === "BUY"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "border-input hover:bg-muted"
            }`}
          >
            BUY — Beli
          </button>
          <button
            type="button"
            onClick={() => setType("SELL")}
            className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              type === "SELL"
                ? "bg-red-600 text-white border-red-600"
                : "border-input hover:bg-muted"
            }`}
          >
            SELL — Jual
          </button>
        </div>
      </div>

      {/* Kantong */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Kantong Investasi</label>
        {goals.length === 0 ? (
          <div className="rounded-md border border-input bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
            Belum ada kantong.{" "}
            <Link href="/investasi?new=1" className="text-primary underline underline-offset-2">
              Buat kantong dulu
            </Link>
          </div>
        ) : (
          <select name="goal_id" className={selectClass}>
            <option value="">— Tanpa kantong —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            Quantity{unit ? ` (${unit})` : ""}
          </label>
          <Input
            name="quantity"
            type="number"
            step="any"
            min="0.00000001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Harga per Unit (Rp)</label>
          <Input
            name="price_per_unit"
            type="number"
            step="any"
            min="1"
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            placeholder="0"
            required
          />
        </div>
      </div>

      {hasTotal && (
        <div
          className={`rounded-md px-4 py-2.5 text-sm font-medium ${
            type === "BUY"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          }`}
        >
          Total {type === "BUY" ? "Modal" : "Hasil"}: {formatRupiah(total)}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Tanggal</label>
        <Input
          name="date"
          type="date"
          defaultValue={defaultDate}
          min={`${year}-01-01`}
          max={`${year}-12-31`}
          required
        />
      </div>

      {type === "BUY" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Dompet Asal (uang keluar dari)</label>
          <select name="from_wallet_id" className={selectClass} required>
            <option value="">— Pilih dompet —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {type === "SELL" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Dompet Tujuan (uang masuk ke)</label>
          <select name="to_wallet_id" className={selectClass} required>
            <option value="">— Pilih dompet —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Catatan (opsional)</label>
        <Input name="notes" placeholder="Catatan tambahan" />
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          className={
            type === "BUY"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white"
              : "bg-red-600 hover:bg-red-700 text-white"
          }
        >
          Catat {type}
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={cancelHref}>Batal</Link>
        </Button>
      </div>
    </form>
  )
}
