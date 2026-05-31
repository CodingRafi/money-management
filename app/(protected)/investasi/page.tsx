import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, X, Target, TrendingUp } from "lucide-react"
import Link from "next/link"
import { GoalForm } from "./_components/goal-form"
import { createGoal, updateGoal, deleteGoal } from "@/app/actions/investment-goals"
import { canEdit } from "@/lib/licence"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

type WalletRow = {
  id: string
  name: string
  color: string | null
  is_liquid: boolean
  category_name: string
  balance: string
}

type GoalRow = {
  id: string
  name: string
  color: string | null
  target_amount: string | null
  target_date: string | null
  total_modal: string
  total_hasil: string
}

type AssetSummaryRow = {
  id: string
  name: string
  category_name: string
  unit: string | null
  total_modal: string
  total_hasil: string
}

export default async function InvestasiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const isActive = await canEdit(userId)

  const sp       = await searchParams
  const showNew  = sp.new === "1" && isActive
  const editId   = typeof sp.edit === "string" && isActive ? sp.edit : null

  const [walletsRes, goalsRes, assetsRes, investSummaryRes] = await Promise.all([
    pool.query<WalletRow>(
      `SELECT w.id, w.name, w.color, w.is_liquid, w.balance::text,
              wc.name AS category_name
       FROM wallets w
       JOIN wallet_categories wc ON wc.id = w.category_id
       WHERE w.user_id = $1 AND w.is_active = true
       ORDER BY w.is_liquid DESC, wc.sort_order, w.sort_order`,
      [userId],
    ),
    pool.query<GoalRow>(
      `SELECT g.id, g.name, g.color,
              g.target_amount::text, g.target_date::text,
              COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0)::text AS total_modal,
              COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0)::text AS total_hasil
       FROM investment_goals g
       LEFT JOIN investment_transactions it ON it.goal_id = g.id
       WHERE g.user_id = $1 AND g.is_active = true
       GROUP BY g.id, g.name, g.color, g.target_amount, g.target_date, g.sort_order
       ORDER BY g.sort_order, g.created_at`,
      [userId],
    ),
    pool.query<AssetSummaryRow>(
      `SELECT i.id, i.name, ic.name AS category_name, i.unit,
              COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0)::text AS total_modal,
              COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0)::text AS total_hasil
       FROM investments i
       JOIN investment_categories ic ON ic.id = i.category_id
       LEFT JOIN investment_transactions it ON it.investment_id = i.id
       WHERE i.user_id = $1 AND i.is_active = true
       GROUP BY i.id, i.name, ic.name, ic.sort_order, i.unit, i.created_at
       ORDER BY ic.sort_order, i.created_at`,
      [userId],
    ),
    pool.query<{ total_modal: string; total_hasil: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0)::text AS total_modal,
         COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0)::text AS total_hasil
       FROM investment_transactions it
       JOIN investments i ON i.id = it.investment_id
       WHERE i.user_id = $1`,
      [userId],
    ),
  ])

  const wallets      = walletsRes.rows
  const goals        = goalsRes.rows
  const assets       = assetsRes.rows
  const investSummary = investSummaryRes.rows[0] ?? { total_modal: "0", total_hasil: "0" }

  const totalLiquid    = wallets.filter((w) => w.is_liquid).reduce((s, w) => s + Number(w.balance), 0)
  const totalNonLiquid = wallets.filter((w) => !w.is_liquid).reduce((s, w) => s + Number(w.balance), 0)
  const totalModal     = Number(investSummary.total_modal)
  const totalHasil     = Number(investSummary.total_hasil)
  const modalAktif     = totalModal - totalHasil
  const totalKekayaan  = totalLiquid + totalNonLiquid + modalAktif
  const realizedPL     = totalHasil - totalModal  // simplified P/L

  const editGoal = editId ? goals.find((g) => g.id === editId) : null

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investasi</h1>
          <p className="text-sm text-muted-foreground">Pantau semua aset dan kantong investasimu</p>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="sm:col-span-2">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Kekayaan Bersih</p>
            <p className="text-xl font-bold tabular-nums">
              {formatRupiah(totalKekayaan)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Liquid + Non-liquid + Investasi aktif</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Liquid</p>
            <p className="text-base font-bold text-blue-600 tabular-nums">{formatRupiah(totalLiquid)}</p>
            <p className="text-xs text-muted-foreground mt-1">Saldo dompet liquid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Modal Aktif Investasi</p>
            <p className="text-base font-bold text-emerald-600 tabular-nums">{formatRupiah(modalAktif)}</p>
            <p className="text-xs text-muted-foreground mt-1">BUY − SELL</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Dompet & Saldo ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Saldo Dompet</h2>
            <Button asChild variant="outline" size="sm">
              <Link href="/dompet">Kelola Dompet</Link>
            </Button>
          </div>

          {wallets.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Belum ada dompet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {wallets.map((w) => (
                  <div key={w.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {w.color && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ backgroundColor: w.color }} />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{w.name}</p>
                        <p className="text-xs text-muted-foreground">{w.category_name}</p>
                      </div>
                    </div>
                    <p className={`tabular-nums font-semibold text-sm ${Number(w.balance) < 0 ? "text-red-600" : "text-foreground"}`}>
                      {formatRupiah(w.balance)}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Semua Aset Investasi ── */}
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Semua Aset</h2>
          {assets.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Belum ada aset investasi.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {assets.map((a) => {
                  const modalAktifAset = Number(a.total_modal) - Number(a.total_hasil)
                  const pl = Number(a.total_hasil) - Number(a.total_modal)
                  return (
                    <div key={a.id} className="flex items-center justify-between px-4 py-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.category_name}{a.unit ? ` · ${a.unit}` : ""}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-emerald-600">
                          {formatRupiah(modalAktifAset)}
                        </p>
                        {Number(a.total_hasil) > 0 && (
                          <p className={`text-xs tabular-nums ${pl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            P/L: {pl >= 0 ? "+" : ""}{formatRupiah(pl)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground">Total Modal Aktif</p>
                  <p className="text-sm font-bold tabular-nums text-emerald-600">{formatRupiah(modalAktif)}</p>
                </div>
                {totalHasil > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">Total P/L Direalisasi</p>
                    <p className={`text-sm font-bold tabular-nums ${realizedPL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {realizedPL >= 0 ? "+" : ""}{formatRupiah(realizedPL)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ── Kantong Investasi ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Kantong Investasi</h2>
          {!showNew && !editId && isActive && (
            <Button asChild size="sm">
              <Link href="?new=1">
                <Plus className="h-4 w-4 mr-1" />Buat Kantong
              </Link>
            </Button>
          )}
        </div>

        {/* Create form */}
        {showNew && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Buat Kantong Baru</p>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                  <Link href="/investasi"><X className="h-4 w-4" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <GoalForm action={createGoal} cancelHref="/investasi" />
            </CardContent>
          </Card>
        )}

        {goals.length === 0 && !showNew ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Target className="mx-auto h-8 w-8 mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Belum ada kantong. Buat kantong untuk mengelompokkan investasimu.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((g) => {
              const modal  = Number(g.total_modal)
              const hasil  = Number(g.total_hasil)
              const aktif  = modal - hasil
              const target = g.target_amount ? Number(g.target_amount) : null
              const progress = target && target > 0 ? Math.min(100, (aktif / target) * 100) : null
              const isEditing = editId === g.id

              if (isEditing) {
                return (
                  <div key={g.id} className="sm:col-span-2 lg:col-span-3">
                    <Card className="border-primary/40">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Edit Kantong</p>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href="/investasi"><X className="h-4 w-4" /></Link>
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <GoalForm
                          action={updateGoal.bind(null, g.id)}
                          defaultValues={{
                            name: g.name,
                            targetAmount: g.target_amount ? Number(g.target_amount) : null,
                            targetDate: g.target_date,
                            color: g.color,
                          }}
                          isEdit
                          cancelHref="/investasi"
                        />
                      </CardContent>
                    </Card>
                  </div>
                )
              }

              return (
                <Card key={g.id} className="overflow-hidden">
                  <div className="h-1.5" style={{ backgroundColor: g.color ?? "#3b82f6" }} />
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{g.name}</p>
                        {target && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Target: {formatRupiah(target)}
                            {g.target_date && (
                              <> · {new Date(g.target_date).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}</>
                            )}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                            <Link href={`?edit=${g.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                          </Button>
                          <form action={deleteGoal.bind(null, g.id)}>
                            <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Modal Aktif</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: g.color ?? "#3b82f6" }}>
                        {formatRupiah(aktif)}
                      </p>
                    </div>

                    {progress !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{progress.toFixed(1)}%</span>
                          <span>{formatRupiah(aktif)} / {formatRupiah(target!)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: g.color ?? "#3b82f6",
                            }}
                          />
                        </div>
                        {g.target_date && target && aktif < target && (
                          <p className="text-xs text-muted-foreground">
                            {(() => {
                              const bulanSisa = Math.max(1, Math.ceil(
                                (new Date(g.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
                              ))
                              const perBulan = (target - aktif) / bulanSisa
                              return `Butuh ~${formatRupiah(perBulan)}/bulan (${bulanSisa} bulan lagi)`
                            })()}
                          </p>
                        )}
                      </div>
                    )}

                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link href={`/investasi/kantong/${g.id}`}>
                        <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                        Lihat Detail
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
