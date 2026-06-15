"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

interface Props {
  loanType: string
  principalAmount: number
  interestRate: number
  interestType: string
  remainingPrincipal: number
  action: (formData: FormData) => Promise<void>
  cancelHref: string
}

export function PaymentForm({
  loanType,
  principalAmount,
  interestRate,
  interestType,
  remainingPrincipal,
  action,
  cancelHref,
}: Props) {
  const today = new Date().toISOString().split("T")[0]
  const [principalPaid, setPrincipalPaid] = useState(0)

  let previewInterest = 0
  if (interestRate > 0) {
    if (interestType === "FLAT") {
      previewInterest = principalAmount * (interestRate / 100)
    } else {
      previewInterest = remainingPrincipal * (interestRate / 100)
    }
  }
  const previewTotal = principalPaid + previewInterest

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">
          Pokok yang Dibayar (Rp) — Sisa: {formatRupiah(remainingPrincipal)}
        </label>
        <Input
          type="number"
          name="principal_paid"
          value={principalPaid || ""}
          onChange={(e) => setPrincipalPaid(parseFloat(e.target.value) || 0)}
          placeholder="0"
          min="1"
          max={Math.floor(remainingPrincipal)}
          step="1"
          required
        />
      </div>

      {principalPaid > 0 && (
        <div className="rounded-md bg-muted/50 px-3 py-2.5 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pokok</span>
            <span className="tabular-nums">{formatRupiah(principalPaid)}</span>
          </div>
          {interestRate > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Bunga ({interestRate}% {interestType})
              </span>
              <span className="tabular-nums text-amber-600">{formatRupiah(previewInterest)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t border-border/50 pt-1 mt-1">
            <span>Total {loanType === "PIUTANG" ? "Diterima" : "Dibayar"}</span>
            <span className={`tabular-nums ${loanType === "PIUTANG" ? "text-emerald-600" : "text-rose-600"}`}>
              {formatRupiah(previewTotal)}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Tanggal</label>
          <Input type="date" name="date" defaultValue={today} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Catatan (opsional)</label>
          <Input name="notes" placeholder="opsional" />
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          id="is_initial_pay"
          name="is_initial"
          value="true"
          className="h-4 w-4 accent-primary"
        />
        <label htmlFor="is_initial_pay" className="text-sm text-muted-foreground cursor-pointer">
          Data awal (tidak mempengaruhi saldo dompet)
        </label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">Tambah Cicilan</Button>
        <Button asChild variant="outline" size="sm">
          <Link href={cancelHref}>Batal</Link>
        </Button>
      </div>
    </form>
  )
}
