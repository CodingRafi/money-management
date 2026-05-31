import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface DefaultValues {
  name?: string
  walletId?: string | null
  notes?: string | null
}

interface Props {
  categories: { id: string; name: string }[]
  wallets: { id: string; name: string }[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: DefaultValues
  isEdit?: boolean
  cancelHref: string
}

export function InvestmentAssetForm({
  categories, wallets, action, defaultValues, isEdit, cancelHref,
}: Props) {
  return (
    <form action={action} className="space-y-3">
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
          <select name="category_id" defaultValue={categories[0]?.id ?? ""} className={selectClass} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Dompet Investasi (opsional)</label>
        <select name="wallet_id" defaultValue={defaultValues?.walletId ?? ""} className={selectClass}>
          <option value="">— Tidak dipilih —</option>
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Catatan (opsional)</label>
        <Input
          name="notes"
          defaultValue={defaultValues?.notes ?? ""}
          placeholder="Catatan tambahan"
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
