"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface Props {
  wallets: { id: string; name: string }[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: {
    type?: string
    name?: string
    description?: string | null
    principalAmount?: number
    interestRate?: number
    interestType?: string
    startDate?: string
    dueDate?: string | null
    walletId?: string
  }
  isEdit?: boolean
  cancelHref: string
}

export function LoanForm({ wallets, action, defaultValues, isEdit, cancelHref }: Props) {
  const [loanType, setLoanType]     = useState(defaultValues?.type ?? "PIUTANG")
  const [interestRate, setInterestRate] = useState(defaultValues?.interestRate ?? 0)

  const today = new Date().toISOString().split("T")[0]

  return (
    <form action={action} className="space-y-4">
      {!isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Tipe Pinjaman</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLoanType("PIUTANG")}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                loanType === "PIUTANG"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "text-muted-foreground hover:text-foreground border-input"
              }`}
            >
              Piutang (Dipinjamkan)
            </button>
            <button
              type="button"
              onClick={() => setLoanType("HUTANG")}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                loanType === "HUTANG"
                  ? "bg-rose-600 text-white border-rose-600"
                  : "text-muted-foreground hover:text-foreground border-input"
              }`}
            >
              Hutang (Dipinjam)
            </button>
          </div>
          <input type="hidden" name="type" value={loanType} />
          <p className="text-xs text-muted-foreground mt-1">
            {loanType === "PIUTANG"
              ? "Kamu meminjamkan uang → saldo berkurang saat dibuat"
              : "Kamu meminjam uang → saldo bertambah saat dibuat"}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            {loanType === "PIUTANG" ? "Nama Peminjam" : "Nama Pemberi Pinjaman"}
          </label>
          <Input
            name="name"
            defaultValue={defaultValues?.name ?? ""}
            placeholder={loanType === "PIUTANG" ? "contoh: Budi" : "contoh: Bank BCA"}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Pokok Pinjaman (Rp)</label>
          <Input
            type="number"
            name="principal_amount"
            defaultValue={defaultValues?.principalAmount ?? ""}
            placeholder="0"
            min="1"
            step="1"
            required
            disabled={isEdit}
          />
          {isEdit && (
            <p className="text-xs text-muted-foreground">Pokok tidak bisa diubah setelah ada cicilan</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Keterangan (opsional)</label>
        <Input
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          placeholder="opsional"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Bunga % / bulan (default 0)</label>
          <Input
            type="number"
            name="interest_rate"
            value={interestRate}
            onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
            placeholder="0"
            min="0"
            step="0.01"
          />
        </div>
        {interestRate > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Tipe Bunga</label>
            <select name="interest_type" defaultValue={defaultValues?.interestType ?? "FLAT"} className={selectClass}>
              <option value="FLAT">FLAT (dari pokok awal)</option>
              <option value="REDUCING">REDUCING (dari sisa pokok)</option>
            </select>
          </div>
        )}
        {interestRate === 0 && (
          <input type="hidden" name="interest_type" value="FLAT" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Tanggal Mulai</label>
          <Input
            type="date"
            name="start_date"
            defaultValue={defaultValues?.startDate ?? today}
            required
            disabled={isEdit}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Jatuh Tempo (opsional)</label>
          <Input
            type="date"
            name="due_date"
            defaultValue={defaultValues?.dueDate ?? ""}
          />
        </div>
      </div>

      {!isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Dompet</label>
          <select name="wallet_id" defaultValue={defaultValues?.walletId ?? ""} className={selectClass} required>
            <option value="">— Pilih dompet —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      )}

      {!isEdit && (
        <div className="flex items-center gap-2.5">
          <input
            type="checkbox"
            id="is_initial_loan"
            name="is_initial"
            value="true"
            className="h-4 w-4 accent-primary"
          />
          <label htmlFor="is_initial_loan" className="text-sm text-muted-foreground cursor-pointer">
            Data awal (tidak mempengaruhi saldo dompet)
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm">{isEdit ? "Simpan Perubahan" : "Buat Pinjaman"}</Button>
        <Button asChild variant="outline" size="sm">
          <Link href={cancelHref}>Batal</Link>
        </Button>
      </div>
    </form>
  )
}
