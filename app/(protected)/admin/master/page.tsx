import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { TrendingUp, TrendingDown, ChevronRight } from "lucide-react"

export default async function MasterPage() {
  const [incomeRes, typeRes, catRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM income_categories WHERE is_default = true AND user_id IS NULL`,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM expense_types WHERE is_default = true AND user_id IS NULL`,
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM expense_categories WHERE is_default = true AND user_id IS NULL`,
    ),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Master Data Kategori</h1>
        <p className="text-sm text-muted-foreground">
          Template default yang di-copy ke akun user baru saat klaim lisensi
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="hover:bg-muted/20 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kategori Pendapatan
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{incomeRes.rows[0].count}</p>
            <p className="text-xs text-muted-foreground mt-1">kategori default</p>
            <Button asChild size="sm" className="mt-4 w-full" variant="outline">
              <Link href="/admin/master/income">
                Kelola
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:bg-muted/20 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Kategori Pengeluaran
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{catRes.rows[0].count}</p>
            <p className="text-xs text-muted-foreground mt-1">
              dalam {typeRes.rows[0].count} tipe
            </p>
            <Button asChild size="sm" className="mt-4 w-full" variant="outline">
              <Link href="/admin/master/expense">
                Kelola
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">
            <strong>Catatan:</strong> Menghapus kategori master tidak menghapus kategori user yang
            sudah di-copy. Perubahan hanya berlaku untuk user yang klaim lisensi setelah perubahan
            ini.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
