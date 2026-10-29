import { z } from "zod"

const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("false"), z.literal("0"), z.null(), z.undefined()])
  .transform((v) => v === "on" || v === "true" || v === "1")

const optionalId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))

const base = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid"),
  name: z.string().trim().min(1, "Nama wajib diisi").max(200),
  amount: z.coerce.number().positive("Nominal harus lebih dari 0").finite(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  is_initial: checkbox,
  wallet_id: optionalId,
  category_id: optionalId,
}

export const incomeSchema = z.object(base)

export const expenseSchema = z.object({
  ...base,
  needs_type: z.enum(["PRIMER", "SEKUNDER", "TERSIER"]),
  is_family_expense: checkbox,
})

export type IncomeInput = z.infer<typeof incomeSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>

export function formToObject(formData: FormData): Record<string, FormDataEntryValue | null> {
  const out: Record<string, FormDataEntryValue | null> = {}
  for (const [k, v] of formData.entries()) out[k] = v
  return out
}
