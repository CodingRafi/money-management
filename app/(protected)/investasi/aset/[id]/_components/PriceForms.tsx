"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"
import { addManualPrice, deleteAssetPrice, importAssetPrices, saveTicker, syncAssetPrices } from "@/app/actions/simulation"

export function PriceForms({ investmentId, ticker, today }: { investmentId: string; ticker: string | null; today: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Gagal" })
    })

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <form
          className="flex items-end gap-2"
          action={(fd) => run(() => saveTicker(investmentId, fd), "Ticker disimpan")}
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">Ticker (format Yahoo, mis. BBRI.JK)</label>
            <Input name="ticker" defaultValue={ticker ?? ""} placeholder="BBRI.JK" className="h-9" maxLength={20} />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Simpan</Button>
          <Button type="button" size="sm" disabled={pending || !ticker}
            onClick={() => run(async () => { const r = await syncAssetPrices(investmentId); return r.ok ? { ok: true } : r }, "Harga berhasil disinkron")}>
            Sync
          </Button>
        </form>

        <form
          className="flex items-end gap-2"
          action={(fd) => run(() => addManualPrice(investmentId, fd), "Harga disimpan")}
        >
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tanggal</label>
            <Input name="date" type="date" defaultValue={today} className="h-9" required />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-muted-foreground">Harga penutupan (Rp)</label>
            <Input name="close" type="number" min="0" step="any" className="h-9" required />
          </div>
          <Button type="submit" size="sm" disabled={pending}>Tambah</Button>
        </form>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Impor banyak harga (tempel CSV: tanggal,harga)</summary>
        <form
          className="mt-2 space-y-2"
          action={(fd) =>
            start(async () => {
              const r = await importAssetPrices(investmentId, fd)
              setMsg(r.ok
                ? { ok: true, text: `${r.data.imported} harga diimpor${r.data.errors.length ? ` · ${r.data.errors.length} baris dilewati` : ""}` }
                : { ok: false, text: r.error })
            })
          }
        >
          <textarea name="csv" rows={5} placeholder={"2024-01-31,4250\n2024-02-29,4390"}
            className="w-full rounded-md border bg-background p-2 text-xs font-mono" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Impor</Button>
        </form>
      </details>

      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.text}</p>}
    </div>
  )
}

export function DeletePriceButton({ investmentId, date }: { investmentId: string; date: string }) {
  const [pending, start] = useTransition()
  return (
    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" disabled={pending}
      onClick={() => start(async () => { await deleteAssetPrice(investmentId, date) })}>
      <Trash2 className="h-3 w-3" />
    </Button>
  )
}
