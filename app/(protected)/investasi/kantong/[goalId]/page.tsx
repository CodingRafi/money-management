import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function formatQty(qty: string, unit: string | null) {
  const n = Number(qty)
  const formatted = n % 1 === 0
    ? n.toLocaleString("id-ID")
    : n.toLocaleString("id-ID", { maximumFractionDigits: 8 })
  return unit ? `${formatted} ${unit}` : formatted
}

type GoalDetail = {
  id: string
  name: string
  color: string | null
  target_amount: string | null
  target_date: string | null
}

type AssetInGoal = {
  id: string
  name: string
  category_name: string
  unit: string | null
  total_modal: string
  total_hasil: string
}

type TxInGoal = {
  id: string
  date: string
  type: string
  quantity: string
  price_per_unit: string
  total_amount: string
  asset_name: string
  unit: string | null
  from_wallet_name: string | null
  to_wallet_name: string | null
  notes: string | null
}

export default async function KantongDetailPage({
  params,
}: {
  params: Promise<{ goalId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const { goalId } = await params

  const [goalRes, assetsRes, txRes] = await Promise.all([
    pool.query<GoalDetail>(
      `SELECT id, name, color, target_amount::text, target_date::text
       FROM investment_goals
       WHERE id=$1 AND user_id=$2 AND is_active=true`,
      [goalId, userId],
    ),
    pool.query<AssetInGoal>(
      `SELECT i.id, i.name, ic.name AS category_name, i.unit,
              COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0)::text AS total_modal,
              COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0)::text AS total_hasil
       FROM investments i
       JOIN investment_categories ic ON ic.id = i.category_id
       JOIN investment_transactions it ON it.investment_id = i.id AND it.goal_id = $1
       WHERE i.user_id = $2
       GROUP BY i.id, i.name, ic.name, ic.sort_order, i.unit
       ORDER BY ic.sort_order, i.name`,
      [goalId, userId],
    ),
    pool.query<TxInGoal>(
      `SELECT it.id, it.date::text, it.type,
              it.quantity::text, it.price_per_unit::text, it.total_amount::text,
              i.name AS asset_name, i.unit,
              fw.name AS from_wallet_name,
              tw.name AS to_wallet_name,
              it.notes
       FROM investment_transactions it
       JOIN investments i ON i.id = it.investment_id
       LEFT JOIN wallets fw ON fw.id = it.from_wallet_id
       LEFT JOIN wallets tw ON tw.id = it.to_wallet_id
       WHERE it.goal_id = $1 AND i.user_id = $2
       ORDER BY it.date DESC, it.created_at DESC`,
      [goalId, userId],
    ),
  ])

  if (!goalRes.rows[0]) redirect("/investasi")

  const goal   = goalRes.rows[0]
  const assets = assetsRes.rows
  const txs    = txRes.rows

  const totalModal = assets.reduce((s, a) => s + Number(a.total_modal), 0)
  const totalHasil = assets.reduce((s, a) => s + Number(a.total_hasil), 0)
  const modalAktif = totalModal - totalHasil
  const target     = goal.target_amount ? Number(goal.target_amount) : null
  const progress   = target && target > 0 ? Math.min(100, (modalAktif / target) * 100) : null

  const bulanSisa = goal.target_date && target && modalAktif < target
    ? Math.max(1, Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
    : null
  const perBulan = bulanSisa && target ? (target - modalAktif) / bulanSisa : null

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <Link href="/investasi"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          {goal.color && (
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: goal.color }} />
          )}
          <h1 className="text-2xl font-bold truncate">{goal.name}</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Modal BUY</p>
            <p className="font-bold text-blue-600 tabular-nums">{formatRupiah(totalModal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Hasil SELL</p>
            <p className="font-bold text-emerald-600 tabular-nums">{formatRupiah(totalHasil)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Modal Aktif</p>
            <p className="font-bold tabular-nums" style={{ color: goal.color ?? "#3b82f6" }}>{formatRupiah(modalAktif)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">P/L Direalisasi</p>
            <p className={`font-bold tabular-nums ${totalHasil - totalModal >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totalHasil > 0
                ? `${totalHasil - totalModal >= 0 ? "+" : ""}${formatRupiah(totalHasil - totalModal)}`
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      {target && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Progress Menuju Target</p>
              <p className="text-sm font-bold tabular-nums">{progress?.toFixed(1)}%</p>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, backgroundColor: goal.color ?? "#3b82f6" }}
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Modal Aktif: {formatRupiah(modalAktif)}</span>
              <span>Target: {formatRupiah(target)}</span>
              {goal.target_date && (
                <span>Deadline: {formatDate(goal.target_date)}</span>
              )}
              {perBulan && perBulan > 0 && (
                <span className="font-medium text-foreground">
                  Estimasi: {formatRupiah(perBulan)}/bulan ({bulanSisa} bulan lagi)
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aset dalam kantong ini */}
      {assets.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">Aset dalam Kantong Ini</h2>
          <Card>
            <CardContent className="p-0 divide-y">
              {assets.map((a) => {
                const aktifAset = Number(a.total_modal) - Number(a.total_hasil)
                const plAset    = Number(a.total_hasil) - Number(a.total_modal)
                return (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.category_name}{a.unit ? ` · ${a.unit}` : ""}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                      <p className="text-sm font-semibold tabular-nums text-blue-600">{formatRupiah(aktifAset)}</p>
                      {Number(a.total_hasil) > 0 && (
                        <p className={`text-xs tabular-nums ${plAset >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          P/L: {plAset >= 0 ? "+" : ""}{formatRupiah(plAset)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Riwayat transaksi */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Riwayat Transaksi</h2>
        <Card>
          <CardContent className="p-0">
            {txs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada transaksi di kantong ini.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                      <th className="px-4 py-3 text-left font-medium">Aset</th>
                      <th className="px-4 py-3 text-left font-medium">Tipe</th>
                      <th className="px-4 py-3 text-right font-medium">Quantity</th>
                      <th className="px-4 py-3 text-right font-medium">Harga/Unit</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-left font-medium">Dompet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3 font-medium">{tx.asset_name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={tx.type === "BUY" ? "default" : "destructive"} className="text-xs">
                            {tx.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatQty(tx.quantity, tx.unit)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {formatRupiah(Number(tx.price_per_unit))}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${
                          tx.type === "BUY" ? "text-blue-600" : "text-emerald-600"
                        }`}>
                          {formatRupiah(Number(tx.total_amount))}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {tx.type === "BUY" ? (tx.from_wallet_name ?? "—") : (tx.to_wallet_name ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20">
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                        Total BUY
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-600">
                        {formatRupiah(totalModal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
