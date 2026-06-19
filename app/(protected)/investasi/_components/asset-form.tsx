"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CATEGORY_UNIT } from "@/lib/investment"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface Props {
  categories: { id: string; name: string }[]
  wallets: { id: string; name: string }[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: {
    name?: string
    walletId?: string | null
    isLiquid?: boolean
    notes?: string | null
  }
  isEdit?: boolean
  cancelHref: string
}

export function AssetForm({ categories, wallets, action, defaultValues, isEdit, cancelHref }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "")

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId)
  const unit = selectedCategory ? (CATEGORY_UNIT[selectedCategory.name] ?? null) : null

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="unit" value={unit ?? ""} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Nama Aset</label>
        <Input
          name="name"
          defaultValue={defaultValues?.name ?? ""}
          placeholder="contoh: Saham BBCA, Bitcoin, Emas Antam 10gr"
          required
        />
      </div>

      {!isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Kategori</label>
          <select
            name="category_id"
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className={selectClass}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {unit && (
            <p className="text-xs text-muted-foreground">
              Satuan: <span className="font-medium">{unit}</span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Dompet Terkait (opsional)</label>
        <select name="wallet_id" defaultValue={defaultValues?.walletId ?? ""} className={selectClass}>
          <option value="">— Tidak dipilih —</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          id="is_liquid_asset"
          name="is_liquid"
          value="true"
          defaultChecked={defaultValues?.isLiquid ?? false}
          className="h-4 w-4 accent-primary"
        />
        <div>
          <label htmlFor="is_liquid_asset" className="text-sm font-medium cursor-pointer">
            Aset Liquid
          </label>
          <p className="text-xs text-muted-foreground">Bisa dicairkan dengan cepat (contoh: Reksa Dana Pasar Uang, Deposito)</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Catatan (opsional)</label>
        <Input
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
          placeholder="contoh: RDN Mandiri Sekuritas"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">{isEdit ? "Simpan" : "Tambah Aset"}</Button>
        <Button asChild variant="outline" size="sm">
          <Link href={cancelHref}>Batal</Link>
        </Button>
      </div>
    </form>
  )
}
