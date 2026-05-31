import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronRight, FolderOpen, TrendingUp, Wallet } from "lucide-react"
import Link from "next/link"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId   = session.user.id
  const firstName = session.user.name.split(" ")[0] ?? "Pengguna"

  const [walletRes, investRes] = await Promise.all([
    pool.query<{ total_liquid: string; total_all: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN w.is_liquid THEN w.balance ELSE 0 END), 0)::text AS total_liquid,
         COALESCE(SUM(w.balance), 0)::text AS total_all
       FROM wallets w
       WHERE w.user_id = $1 AND w.is_active = true`,
      [userId],
    ),
    pool.query<{ modal_aktif: string }>(
      `SELECT
         COALESCE(
           SUM(CASE WHEN it.type='BUY' THEN it.total_amount ELSE -it.total_amount END), 0
         )::text AS modal_aktif
       FROM investment_transactions it
       JOIN investments i ON i.id = it.investment_id
       WHERE i.user_id = $1`,
      [userId],
    ),
  ])

  const totalLiquid   = Number(walletRes.rows[0]?.total_liquid ?? 0)
  const totalAll      = Number(walletRes.rows[0]?.total_all ?? 0)
  const modalAktif    = Number(investRes.rows[0]?.modal_aktif ?? 0)
  const totalKekayaan = totalAll + modalAktif

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Selamat datang kembali, {firstName}!</p>
      </div>

      {/* Quick summary */}
      {totalKekayaan !== 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Kekayaan</p>
              <p className="font-bold tabular-nums">{formatRupiah(totalKekayaan)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Liquid</p>
              <p className="font-bold text-blue-600 tabular-nums">{formatRupiah(totalLiquid)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Investasi Aktif</p>
              <p className="font-bold text-emerald-600 tabular-nums">{formatRupiah(modalAktif)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Manage Keuangan */}
        <Link href="/rekap" className="group">
          <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <FolderOpen className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold">Rekap Keuangan</p>
                <p className="mt-1 text-sm text-muted-foreground">Kelola pendapatan & pengeluaran</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                Buka <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>

        {/* Dompet */}
        <Link href="/dompet" className="group">
          <Card className="h-full transition-all group-hover:border-blue-500/50 group-hover:shadow-md cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 group-hover:bg-blue-500/20 transition-colors">
                <Wallet className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold">Dompet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalLiquid !== 0 ? formatRupiah(totalLiquid) : "Kelola akun keuangan"}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                Buka <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>

        {/* Investasi */}
        <Link href="/investasi" className="group">
          <Card className="h-full transition-all group-hover:border-emerald-500/50 group-hover:shadow-md cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 group-hover:bg-emerald-500/20 transition-colors">
                <TrendingUp className="h-7 w-7" />
              </div>
              <div>
                <p className="text-base font-semibold">Investasi</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {modalAktif !== 0 ? formatRupiah(modalAktif) : "Pantau aset investasi"}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                Buka <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
