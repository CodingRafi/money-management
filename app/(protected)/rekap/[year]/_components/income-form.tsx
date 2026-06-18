import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface DefaultValues {
  date?: string
  name?: string
  categoryId?: string | null
  walletId?: string | null
  amount?: number
  isInitial?: boolean
}

interface Props {
  year: number
  month: number
  categories: { id: string; name: string }[]
  wallets: { id: string; name: string }[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: DefaultValues
  submitLabel?: string
}

export function IncomeForm({
  year, month, categories, wallets, action, defaultValues, submitLabel = "Simpan Pendapatan",
}: Props) {
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const defaultDate = defaultValues?.date ?? (isCurrentMonth
    ? now.toISOString().split("T")[0]
    : `${year}-${String(month).padStart(2, "0")}-01`)

  const defaultCategoryId = defaultValues?.categoryId ?? categories.find((c) => c.name === "INVESTASI")?.id ?? ""

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Tanggal</label>
          <Input type="date" name="date" defaultValue={defaultDate} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Jumlah (Rp)</label>
          <Input type="number" name="amount" defaultValue={defaultValues?.amount ?? ""} placeholder="0" min="1" step="1" required />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Nama / Keterangan</label>
        <Input name="name" defaultValue={defaultValues?.name ?? ""} placeholder="contoh: Gaji bulanan" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Kategori</label>
          <select name="category_id" defaultValue={defaultCategoryId} className={selectClass}>
            <option value="">— Pilih kategori —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Wallet Tujuan</label>
          <select name="wallet_id" defaultValue={defaultValues?.walletId ?? ""} className={selectClass}>
            <option value="">— Pilih wallet —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="is_initial_income"
          name="is_initial"
          value="true"
          defaultChecked={defaultValues?.isInitial ?? false}
          className="h-4 w-4 accent-primary"
        />
        <label htmlFor="is_initial_income" className="text-sm text-muted-foreground">
          Data awal (tidak mempengaruhi saldo dompet)
        </label>
      </div>

      <Button type="submit" size="sm">{submitLabel}</Button>
    </form>
  )
}
