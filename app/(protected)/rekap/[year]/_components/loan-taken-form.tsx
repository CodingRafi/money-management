import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface DefaultValues {
  lender?: string
  amount?: number
  notes?: string | null
}

interface Props {
  year: number
  month: number
  action: (formData: FormData) => Promise<void>
  defaultValues?: DefaultValues
  submitLabel?: string
}

export function LoanTakenForm({ year, month, action, defaultValues, submitLabel = "Simpan Hutang" }: Props) {
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Nama Pemberi Hutang</label>
          <Input name="lender" defaultValue={defaultValues?.lender ?? ""} placeholder="contoh: Bank BCA" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Jumlah (Rp)</label>
          <Input type="number" name="amount" defaultValue={defaultValues?.amount ?? ""} placeholder="0" min="1" step="1" required />
        </div>
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
