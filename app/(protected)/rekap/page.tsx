import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"

type YearRow = { year: number }

export default async function RekapPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const { rows: yearRows } = await pool.query<YearRow>(
    `SELECT DISTINCT year FROM (
       SELECT year FROM incomes     WHERE user_id = $1
       UNION
       SELECT year FROM expenses    WHERE user_id = $1
       UNION
       SELECT year FROM loans_given WHERE user_id = $1
       UNION
       SELECT year FROM loans_taken WHERE user_id = $1
     ) y ORDER BY year DESC`,
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
            <Link href="/settings/categories">Kategori &amp; Budget</Link>
          </Button>
        </div>
      </div>

      {/* Year list */}
      <div className="space-y-3">
        {yearRows.map((row) => (
          <Link
            key={row.year}
            href={`/rekap/${row.year}`}
            className="flex items-center rounded-xl border px-5 py-4 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            Rekap Keuangan {row.year}
          </Link>
        ))}

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
