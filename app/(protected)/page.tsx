import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Wallet } from "lucide-react"

type Transaction = {
  id: string
  date: string
  description: string
  category: string
  amount: number
  type: "income" | "expense"
}

const mockTransactions: Transaction[] = [
  { id: "1", date: "2026-05-30", description: "Gaji Bulanan", category: "Pemasukan", amount: 8000000, type: "income" },
  { id: "2", date: "2026-05-29", description: "Belanja Bulanan", category: "Kebutuhan", amount: 500000, type: "expense" },
  { id: "3", date: "2026-05-28", description: "Listrik & Air", category: "Utilitas", amount: 350000, type: "expense" },
  { id: "4", date: "2026-05-27", description: "Makan Siang", category: "Makanan", amount: 75000, type: "expense" },
  { id: "5", date: "2026-05-26", description: "Transportasi", category: "Transport", amount: 200000, type: "expense" },
  { id: "6", date: "2026-05-25", description: "Freelance Project", category: "Pemasukan", amount: 2500000, type: "income" },
]

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })

  const totalIncome = mockTransactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpense = mockTransactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  const balance = totalIncome - totalExpense

  const firstName = session?.user.name.split(" ")[0] ?? "Pengguna"

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Selamat datang kembali, {firstName}!</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pemasukan</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{formatRupiah(totalIncome)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Bulan ini</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pengeluaran</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{formatRupiah(totalExpense)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Bulan ini</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${balance >= 0 ? "text-foreground" : "text-red-600"}`}>
              {formatRupiah(balance)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Pemasukan − Pengeluaran</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {mockTransactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      tx.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                    }`}
                  >
                    {tx.type === "income" ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={tx.type === "income" ? "success" : "warning"} className="hidden sm:inline-flex">
                    {tx.category}
                  </Badge>
                  <p
                    className={`text-sm font-semibold tabular-nums ${
                      tx.type === "income" ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {formatRupiah(tx.amount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
