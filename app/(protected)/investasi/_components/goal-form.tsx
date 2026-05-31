"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
]

interface DefaultValues {
  name?: string
  targetAmount?: number | null
  targetDate?: string | null
  color?: string | null
}

interface Props {
  action: (formData: FormData) => Promise<void>
  defaultValues?: DefaultValues
  isEdit?: boolean
  cancelHref: string
}

export function GoalForm({ action, defaultValues, isEdit, cancelHref }: Props) {
  const [selectedColor, setSelectedColor] = useState(defaultValues?.color ?? COLORS[0])

  const defaultTargetDate = defaultValues?.targetDate
    ? new Date(defaultValues.targetDate).toISOString().split("T")[0]
    : ""

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="color" value={selectedColor} />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Nama Kantong</label>
        <Input
          name="name"
          defaultValue={defaultValues?.name ?? ""}
          placeholder="contoh: Rumah, Pensiun, Dana Darurat"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Target Nominal (opsional)</label>
          <Input
            name="target_amount"
            type="number"
            min="1"
            step="any"
            defaultValue={defaultValues?.targetAmount ?? ""}
            placeholder="0"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Target Tanggal (opsional)</label>
          <Input
            name="target_date"
            type="date"
            defaultValue={defaultTargetDate}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Warna</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedColor(c)}
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                selectedColor === c
                  ? "border-foreground scale-110 shadow-md"
                  : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm">{isEdit ? "Simpan" : "Buat Kantong"}</Button>
        <Button asChild variant="outline" size="sm">
          <Link href={cancelHref}>Batal</Link>
        </Button>
      </div>
    </form>
  )
}
