"use client"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

type WalletCategory = { id: string; name: string }

interface WalletFormProps {
  categories: WalletCategory[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: {
    name?: string
    categoryId?: string
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
