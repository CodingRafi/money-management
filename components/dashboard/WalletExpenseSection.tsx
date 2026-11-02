import { getExpenseByWallet } from "@/lib/dashboard"
import { WalletExpensePieChart } from "./WalletExpensePieChart"
import { Card, CardContent } from "@/components/ui/card"

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

/** Pie chart pengeluaran per dompet untuk bulan yang sedang dipilih. */
export async function WalletExpenseSection({
  userId,
  excludeFamily = false,
  month,
  year,
}: {
  userId: string | string[]
  excludeFamily?: boolean
  month: number
  year: number
}) {
  const data = await getExpenseByWallet(userId, year, month, { excludeFamily })
  if (data.items.length === 0) return null

  return (
    <WalletExpensePieChart
      items={data.items.map((w) => ({
        id: w.id,
        name: w.name,
        categoryName: w.category_name,
        color: w.color,
        total: w.total,
      }))}
      subtitle={`Pengeluaran ${MONTHS[month - 1]} ${year} per dompet`}
    />
  )
}

export function WalletExpenseSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 animate-pulse space-y-3">
        <div className="h-3 w-40 bg-muted rounded" />
        <div className="h-[180px] w-full bg-muted rounded" />
      </CardContent>
    </Card>
  )
}
