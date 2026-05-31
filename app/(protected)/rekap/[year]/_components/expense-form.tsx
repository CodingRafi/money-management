import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface ExpenseCat { id: string; name: string; type_name: string }

interface DefaultValues {
  date?: string
  name?: string
  walletId?: string | null
  categoryId?: string | null
  needsType?: string
  amount?: number
  isInitial?: boolean
}

interface Props {
  year: number
  month: number
  categories: ExpenseCat[]
  wallets: { id: string; name: string }[]
  action: (formData: FormData) => Promise<void>
  defaultValues?: DefaultValues
  submitLabel?: string
}

export function ExpenseForm({
  year, month, categories, wallets, action, defaultValues, submitLabel = "Simpan Pengeluaran",
}: Props) {
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const defaultDate = defaultValues?.date ?? (isCurrentMonth
    ? now.toISOString().split("T")[0]
    : `${year}-${String(month).padStart(2, "0")}-01`)

  const groups: Record<string, ExpenseCat[]> = {}
  for (const cat of categories) {
    groups[cat.type_name] ??= []
    groups[cat.type_name].push(cat)
  }

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
        <Input name="name" defaultValue={defaultValues?.name ?? ""} placeholder="contoh: Belanja bulanan" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Wallet Sumber</label>
          <select name="wallet_id" defaultValue={defaultValues?.walletId ?? ""} className={selectClass}>
            <option value="">— Pilih wallet —</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Jenis Kebutuhan</label>
          <select name="needs_type" defaultValue={defaultValues?.needsType ?? "PRIMER"} className={selectClass} required>
            <option value="PRIMER">PRIMER</option>
            <option value="SEKUNDER">SEKUNDER</option>
            <option value="TERSIER">TERSIER</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Kategori</label>
        <select name="category_id" defaultValue={defaultValues?.categoryId ?? ""} className={selectClass}>
          <option value="">— Pilih kategori —</option>
          {Object.entries(groups).map(([typeName, cats]) => (
            <optgroup key={typeName} label={typeName}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <input
          type="checkbox"
          id="is_initial_expense"
          name="is_initial"
          value="true"
          defaultChecked={defaultValues?.isInitial ?? false}
          className="h-4 w-4 accent-primary"
        />
        <label htmlFor="is_initial_expense" className="text-sm text-muted-foreground">
          Data awal (tidak mempengaruhi saldo dompet)
        </label>
      </div>

      <Button type="submit" size="sm">{submitLabel}</Button>
    </form>
  )
}
