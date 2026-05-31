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
}

export function TransactionForm({ wallets, goals, action, cancelHref }: Props) {
  const [type, setType] = useState<"BUY" | "SELL">("BUY")

  const today = new Date().toISOString().split("T")[0]

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="type" value={type} />

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

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">
          Kantong Investasi{type === "BUY" ? " *" : " (opsional)"}
        </label>
        {type === "BUY" && goals.length === 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
            Belum ada kantong.{" "}
            <Link href="/investasi?new=1" className="font-medium underline underline-offset-2">
              Buat kantong dulu
            </Link>{" "}
            sebelum mencatat transaksi BUY.
          </div>
        ) : (
          <select name="goal_id" className={selectClass} required={type === "BUY"}>
            {type === "BUY" ? (
              <option value="">— Pilih kantong —</option>
            ) : (
              <option value="">— Tanpa kantong —</option>
            )}
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Quantity (opsional)</label>
          <Input
            name="quantity"
            type="text"
            placeholder="contoh: 10 lot, 5 gram"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Harga Transaksi (Rp)</label>
          <Input
            name="total_amount"
            type="number"
            step="any"
            min="1"
            placeholder="0"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Tanggal</label>
        <Input name="date" type="date" defaultValue={today} required />
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

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="is_initial_inv"
          name="is_initial"
          value="true"
          className="h-4 w-4 accent-primary"
        />
        <label htmlFor="is_initial_inv" className="text-sm text-muted-foreground">
          Data awal (tidak mempengaruhi saldo dompet)
        </label>
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
