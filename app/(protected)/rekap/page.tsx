import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"

type YearRow = {
  year: number
  total_income: string
  total_expense: string
  balance: string
}

function formatRupiah(amount: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(amount))
}

export default async function RekapPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const { rows: yearRows } = await pool.query<YearRow>(
    `SELECT year, total_income::text, total_expense::text, balance::text
     FROM yearly_recap
     WHERE user_id = $1
     ORDER BY year DESC`,
    [userId],
  )

  const currentYear = new Date().getFullYear()
  const hasCurrentYear = yearRows.some((r) => r.year === currentYear)

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Manage Keuangan</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dompet">Dompet</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/rekap/${new Date().getFullYear()}?view=kategori`}>Kategori &amp; Budget</Link>
          </Button>
        </div>
      </div>

      {/* Year list */}
      <div className="space-y-3">
        {yearRows.map((row) => {
          const balance = parseFloat(row.balance)
          return (
            <Link
              key={row.year}
              href={`/rekap/${row.year}`}
              className="flex flex-col rounded-xl border px-5 py-4 hover:bg-muted/40 transition-colors"
            >
              <span className="text-sm font-medium">Rekap Keuangan {row.year}</span>
              <div className="flex gap-4 mt-1.5 text-xs">
                <span className="text-emerald-600">↑ {formatRupiah(row.total_income)}</span>
                <span className="text-red-600">↓ {formatRupiah(row.total_expense)}</span>
                <span className={balance >= 0 ? "text-blue-600" : "text-red-600"}>
                  = {formatRupiah(row.balance)}
                </span>
              </div>
            </Link>
          )
        })}

        {/* Placeholder / tambah tahun ini */}
        {!hasCurrentYear && (
          <Link
            href={`/rekap/${currentYear}`}
            className="flex items-center gap-2 rounded-xl border border-dashed px-5 py-4 text-sm text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Rekap Keuangan {currentYear}
          </Link>
        )}
      </div>
    </div>
  )
}
