"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

type WalletCategory = { id: string; name: string; is_liquid: boolean }

interface WalletFormProps {
  categories: WalletCategory[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: {
    name?: string
    categoryId?: string
    isLiquid?: boolean
    color?: string
  }
  isEdit?: boolean
  cancelHref: string
}

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

export function WalletForm({
  categories,
  action,
  defaultValues,
  isEdit,
  cancelHref,
}: WalletFormProps) {
  const firstCat = categories[0]
  const initCatId = defaultValues?.categoryId ?? firstCat?.id ?? ""
  const initCat   = categories.find((c) => c.id === initCatId)

  const [isLiquid, setIsLiquid] = useState(
    defaultValues?.isLiquid ?? initCat?.is_liquid ?? true,
  )

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cat = categories.find((c) => c.id === e.target.value)
    if (cat) setIsLiquid(cat.is_liquid)
  }

  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Nama Dompet</label>
        <Input
          name="name"
          defaultValue={defaultValues?.name}
          placeholder="contoh: BCA Utama"
          required
        />
      </div>

      {!isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Kategori</label>
          <select
            name="category_id"
            defaultValue={initCatId}
            onChange={handleCategoryChange}
            className={selectClass}
            required
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      )}

<div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Status Likuiditas</label>
        <input type="hidden" name="is_liquid" value={isLiquid ? "true" : "false"} />
        <select
          value={isLiquid ? "true" : "false"}
          onChange={(e) => setIsLiquid(e.target.value === "true")}
          className={selectClass}
        >
          <option value="true">Liquid (mudah dicairkan)</option>
          <option value="false">Tidak Liquid</option>
        </select>
      </div>

      {!isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Saldo Awal (opsional)</label>
          <Input
            name="initial_balance"
            type="number"
            step="any"
            min="0"
            placeholder="0"
          />
          <p className="text-xs text-muted-foreground">
            Isi jika dompet ini sudah punya saldo sebelum pakai aplikasi.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Warna (opsional)</label>
        <Input
          name="color"
          defaultValue={defaultValues?.color}
          placeholder="#3b82f6"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit">{isEdit ? "Simpan" : "Tambah Dompet"}</Button>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Batal</Link>
        </Button>
      </div>
    </form>
  )
}
