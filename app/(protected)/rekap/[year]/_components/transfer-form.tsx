"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface LiquidWallet {
  id: string
  name: string
  color: string | null
}

interface Props {
  wallets: LiquidWallet[]
  action: (formData: FormData) => Promise<void>
  year: number
  month: number
}

export function TransferForm({ wallets, action, year, month }: Props) {
  const [fromId, setFromId] = useState(wallets[0]?.id ?? "")

  const now            = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const defaultDate    = isCurrentMonth
    ? now.toISOString().split("T")[0]
    : `${year}-${String(month).padStart(2, "0")}-01`

  const toWallets = wallets.filter((w) => w.id !== fromId)

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="year"  value={year} />
      <input type="hidden" name="month" value={month} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Dari Dompet</label>
          <select
            name="from_wallet_id"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className={selectClass}
            required
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Ke Dompet</label>
          <select name="to_wallet_id" className={selectClass} required>
            <option value="">— Pilih tujuan —</option>
            {toWallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Jumlah (Rp)</label>
          <Input
            type="number"
            name="amount"
            placeholder="0"
            min="1"
            step="1"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Tanggal</label>
          <Input
            type="date"
            name="date"
            defaultValue={defaultDate}
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Catatan (opsional)</label>
        <Input name="notes" placeholder="Catatan transfer" />
      </div>

      <Button type="submit" size="sm">Catat Transfer</Button>
    </form>
  )
}
