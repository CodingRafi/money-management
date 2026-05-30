import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"

interface DefaultValues {
  borrower?: string
  amount?: number
  status?: string
  notes?: string | null
}

interface Props {
  year: number
  month: number
  action: (formData: FormData) => Promise<void>
  defaultValues?: DefaultValues
  submitLabel?: string
}

export function LoanGivenForm({ year, month, action, defaultValues, submitLabel = "Simpan Pinjaman" }: Props) {
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Nama Peminjam</label>
          <Input name="borrower" defaultValue={defaultValues?.borrower ?? ""} placeholder="contoh: Budi" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Jumlah (Rp)</label>
          <Input type="number" name="amount" defaultValue={defaultValues?.amount ?? ""} placeholder="0" min="1" step="1" required />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Status</label>
        <select name="status" defaultValue={defaultValues?.status ?? "FIX"} className={selectClass} required>
          <option value="FIX">FIX — pasti kembali</option>
          <option value="GANTUNG">GANTUNG — mungkin tidak kembali</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Keterangan</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={defaultValues?.notes ?? ""}
          placeholder="opsional"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <Button type="submit" size="sm">{submitLabel}</Button>
    </form>
  )
}
