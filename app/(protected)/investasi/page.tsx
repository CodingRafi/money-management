import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, X, Target, TrendingUp, ChevronRight, BarChart2 } from "lucide-react"
import Link from "next/link"
import { GoalForm } from "./_components/goal-form"
import { AssetForm } from "./_components/asset-form"
import { DeleteGoalButton } from "./_components/delete-goal-button"
import { createGoal, updateGoal } from "@/app/actions/investment-goals"
import { createInvestmentDirect } from "@/app/actions/investments"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

type WalletRow   = { id: string; name: string; color: string | null; balance: number; category_name: string }
type GoalRow     = { id: string; name: string; color: string | null; target_amount: number | null; target_date: string | null; total_modal: number; total_hasil: number }
type AssetRow    = { id: string; name: string; category_name: string; is_liquid: number; is_closed: number; total_modal: number; total_hasil: number }
type CategoryRow = { id: string; name: string }

export default async function InvestasiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = LOCAL_USER_ID
  const sp          = await searchParams
  const showNew     = sp.new === "1"
  const showNewAset = sp.newAset === "1"
  const editId      = typeof sp.edit === "string" ? sp.edit : null
  const asetTab     = sp.asetTab === "history" ? "history" : "aktif"

  const wallets = db.prepare<[string], WalletRow>(
    `SELECT w.id, w.name, w.color, w.balance, wc.name AS category_name
     FROM wallets w JOIN wallet_categories wc ON wc.id = w.category_id
     WHERE w.user_id = ? AND w.is_active = 1
     ORDER BY wc.sort_order, w.sort_order`
  ).all(userId) as WalletRow[]

  const goals = db.prepare<[string], GoalRow>(
    `SELECT g.id, g.name, g.color, g.target_amount, g.target_date,
            COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_modal,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_hasil
     FROM investment_goals g
     LEFT JOIN investment_transactions it ON it.goal_id = g.id
     WHERE g.user_id = ? AND g.is_active = 1
     GROUP BY g.id, g.name, g.color, g.target_amount, g.target_date, g.sort_order
     ORDER BY g.sort_order, g.created_at`
  ).all(userId) as GoalRow[]

  const assets = db.prepare<[string], AssetRow>(
    `SELECT i.id, i.name, ic.name AS category_name, i.is_liquid, i.is_closed,
            COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_modal,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_hasil
     FROM investments i
     JOIN investment_categories ic ON ic.id = i.category_id
     LEFT JOIN investment_transactions it ON it.investment_id = i.id
     WHERE i.user_id = ? AND i.is_active = 1
     GROUP BY i.id, i.name, ic.name, ic.sort_order, i.is_liquid, i.is_closed, i.created_at
     ORDER BY ic.sort_order, i.created_at`
  ).all(userId) as AssetRow[]

  const activeAssets = assets.filter((a) => !a.is_closed)
  const closedAssets = assets.filter((a) => a.is_closed)

  const investSummary = db.prepare<[string]>(
    `SELECT COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_modal,
            COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_hasil
     FROM investment_transactions it JOIN investments i ON i.id = it.investment_id
     WHERE i.user_id = ? AND i.is_closed = 0`
  ).get(userId) as { total_modal: number; total_hasil: number }

  const realizedTahunIni = db.prepare<[string]>(
    `SELECT
       COALESCE(SUM(CASE WHEN it.type='BUY'  THEN it.total_amount ELSE 0 END),0) AS total_modal,
       COALESCE(SUM(CASE WHEN it.type='SELL' THEN it.total_amount ELSE 0 END),0) AS total_hasil,
       COUNT(DISTINCT i.id) AS jumlah_aset
     FROM investment_transactions it
     JOIN investments i ON i.id = it.investment_id
     WHERE i.user_id = ? AND i.is_closed = 1
       AND strftime('%Y', i.closed_at) = strftime('%Y', 'now')`
  ).get(userId) as { total_modal: number; total_hasil: number; jumlah_aset: number }

  const dividenTahunIni = db.prepare<[string]>(
    `SELECT COALESCE(SUM(it.total_amount), 0) AS total_dividen
     FROM investment_transactions it
     JOIN investments i ON i.id = it.investment_id
     WHERE i.user_id = ? AND it.type = 'DIVIDEND'
       AND strftime('%Y', it.date) = strftime('%Y', 'now')`
  ).get(userId) as { total_dividen: number }

  const categories = db.prepare<[], CategoryRow>(
    "SELECT id, name FROM investment_categories ORDER BY sort_order, name"
  ).all() as CategoryRow[]

  const totalLiquid   = wallets.reduce((s, w) => s + w.balance, 0)
  const totalModal    = investSummary?.total_modal ?? 0
  const totalHasil    = investSummary?.total_hasil ?? 0
  const modalAktif    = totalModal - totalHasil

  const realizedModal     = realizedTahunIni?.total_modal  ?? 0
  const realizedHasil     = realizedTahunIni?.total_hasil  ?? 0
  const realizedCount     = realizedTahunIni?.jumlah_aset  ?? 0
  const totalDividenTahun = dividenTahunIni?.total_dividen ?? 0
  const realizedPL        = (realizedHasil - realizedModal) + totalDividenTahun

  const liquidModalAktif    = activeAssets.reduce((s, a) => a.is_liquid  ? s + a.total_modal - a.total_hasil : s, 0)
  const nonLiquidModalAktif = activeAssets.reduce((s, a) => !a.is_liquid ? s + a.total_modal - a.total_hasil : s, 0)
  const liquidPct    = modalAktif > 0 ? (liquidModalAktif    / modalAktif) * 100 : 0
  const nonLiquidPct = modalAktif > 0 ? (nonLiquidModalAktif / modalAktif) * 100 : 0

  const editGoal = editId ? goals.find((g) => g.id === editId) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investasi</h1>
          <p className="text-sm text-muted-foreground">Pantau semua aset dan kantong investasimu</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/investasi/rekap"><BarChart2 className="h-4 w-4 mr-1.5" />Lihat Rekap</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="sm:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Investasi Saat Ini</p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatRupiah(modalAktif)}</p>
            <p className="text-xs text-muted-foreground mt-1">BUY − SELL (semua waktu)</p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Realized P/L Tahun Ini</p>
            {realizedCount === 0 && totalDividenTahun === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">Belum ada P/L atau dividen tahun ini</p>
            ) : (
              <>
                <p className={`text-xl font-bold tabular-nums mt-1 ${realizedPL > 0 ? "text-emerald-600" : realizedPL < 0 ? "text-red-600" : "text-foreground"}`}>
                  {realizedPL >= 0 ? "+" : ""}{formatRupiah(realizedPL)}
                </p>
                <div className="mt-1 space-y-0.5">
                  {realizedCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Capital: {formatRupiah(realizedHasil - realizedModal)} · {realizedCount} aset ditutup
                    </p>
                  )}
                  {totalDividenTahun > 0 && (
                    <p className="text-xs text-teal-600 font-medium">
                      Dividen: +{formatRupiah(totalDividenTahun)}
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="sm:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Saldo Dompet</p>
            <p className="text-xl font-bold text-blue-600 tabular-nums">{formatRupiah(totalLiquid)}</p>
          </CardContent>
        </Card>
      </div>

      {modalAktif > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Liquid</p>
                <span className="text-xs font-semibold text-emerald-600">{liquidPct.toFixed(1)}%</span>
              </div>
              <p className="text-base font-bold text-emerald-600 tabular-nums">{formatRupiah(liquidModalAktif)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${liquidPct}%` }} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted-foreground">Not Liquid</p>
                <span className="text-xs font-semibold text-amber-600">{nonLiquidPct.toFixed(1)}%</span>
              </div>
              <p className="text-base font-bold text-amber-600 tabular-nums">{formatRupiah(nonLiquidModalAktif)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${nonLiquidPct}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Saldo Dompet</h2>
            <Button asChild variant="outline" size="sm"><Link href="/dompet">Kelola Dompet</Link></Button>
          </div>
          {wallets.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Belum ada dompet.</CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                {wallets.map((w) => (
                  <div key={w.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {w.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ backgroundColor: w.color }} />}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{w.name}</p>
                        <p className="text-xs text-muted-foreground">{w.category_name}</p>
                      </div>
                    </div>
                    <p className={`tabular-nums font-semibold text-sm ${w.balance < 0 ? "text-red-600" : "text-foreground"}`}>{formatRupiah(w.balance)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Semua Aset</h2>
            {!showNewAset && asetTab === "aktif" && (
              <Button asChild size="sm"><Link href="?newAset=1"><Plus className="h-4 w-4 mr-1" />Tambah Aset</Link></Button>
            )}
          </div>

          {/* Tab navigation */}
          <div className="flex items-center gap-1 border-b">
            <Link
              href="?asetTab=aktif"
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                asetTab === "aktif"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Aktif
              {activeAssets.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                  {activeAssets.length}
                </span>
              )}
            </Link>
            <Link
              href="?asetTab=history"
              className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                asetTab === "history"
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              History
              {closedAssets.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                  {closedAssets.length}
                </span>
              )}
            </Link>
          </div>

          {asetTab === "aktif" ? (
            <>
              {showNewAset && (
                <Card>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Tambah Aset Baru</p>
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href="/investasi"><X className="h-4 w-4" /></Link></Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <AssetForm categories={categories} wallets={wallets} action={createInvestmentDirect} cancelHref="/investasi" />
                  </CardContent>
                </Card>
              )}

              {activeAssets.length === 0 && !showNewAset ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada aset investasi aktif. <Link href="?newAset=1" className="text-primary underline underline-offset-2">Tambah sekarang</Link>.
                  </CardContent>
                </Card>
              ) : activeAssets.length > 0 && (
                <Card>
                  <CardContent className="p-0 divide-y">
                    {activeAssets.map((a) => {
                      const modalAktifAset = a.total_modal - a.total_hasil
                      const pl             = a.total_hasil - a.total_modal
                      return (
                        <Link key={a.id} href={`/investasi/aset/${a.id}`}
                          className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-muted/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{a.name}</p>
                            <p className="text-xs text-muted-foreground">{a.category_name}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className="text-sm font-semibold tabular-nums text-emerald-600">{formatRupiah(modalAktifAset)}</p>
                              {a.total_hasil > 0 && (
                                <p className={`text-xs tabular-nums ${pl >= 0 ? "text-emerald-600" : "text-red-600"}`}>P/L: {pl >= 0 ? "+" : ""}{formatRupiah(pl)}</p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Link>
                      )
                    })}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground">Total Modal Aktif</p>
                      <p className="text-sm font-bold tabular-nums text-emerald-600">{formatRupiah(modalAktif)}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              {closedAssets.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Belum ada aset yang ditutup.
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0 divide-y">
                    {closedAssets.map((a) => {
                      const pl = a.total_hasil - a.total_modal
                      return (
                        <Link key={a.id} href={`/investasi/aset/${a.id}`}
                          className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-muted/40 transition-colors">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate text-muted-foreground">{a.name}</p>
                            <p className="text-xs text-muted-foreground">{a.category_name}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p className={`text-sm font-semibold tabular-nums ${pl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                P/L: {pl >= 0 ? "+" : ""}{formatRupiah(pl)}
                              </p>
                              <p className="text-xs text-muted-foreground tabular-nums">Modal: {formatRupiah(a.total_modal)}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </Link>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Kantong Investasi</h2>
          {!showNew && !editId && (
            <Button asChild size="sm"><Link href="?new=1" scroll={false}><Plus className="h-4 w-4 mr-1" />Buat Kantong</Link></Button>
          )}
        </div>

        {showNew && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Buat Kantong Baru</p>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href="/investasi" scroll={false}><X className="h-4 w-4" /></Link></Button>
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
              <p className="text-sm text-muted-foreground">Belum ada kantong. Buat kantong untuk mengelompokkan investasimu.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((g) => {
              const modal    = g.total_modal
              const hasil    = g.total_hasil
              const aktif    = modal - hasil
              const target   = g.target_amount
              const progress = target && target > 0 ? Math.min(100, (aktif / target) * 100) : null
              const isEditing = editId === g.id

              if (isEditing) {
                return (
                  <div key={g.id} className="sm:col-span-2 lg:col-span-3">
                    <Card className="border-primary/40">
                      <CardHeader className="pb-2 pt-4 px-4">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">Edit Kantong</p>
                          <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href="/investasi" scroll={false}><X className="h-4 w-4" /></Link></Button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <GoalForm
                          action={updateGoal.bind(null, g.id)}
                          defaultValues={{ name: g.name, targetAmount: g.target_amount, targetDate: g.target_date, color: g.color }}
                          isEdit cancelHref="/investasi" />
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
                            {g.target_date && <> · {new Date(g.target_date).toLocaleDateString("id-ID", { month: "short", year: "numeric" })}</>}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                          <Link href={`?edit=${g.id}`} scroll={false}><Pencil className="h-3.5 w-3.5" /></Link>
                        </Button>
                        <DeleteGoalButton goalId={g.id} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Modal Aktif</p>
                      <p className="text-lg font-bold tabular-nums" style={{ color: g.color ?? "#3b82f6" }}>{formatRupiah(aktif)}</p>
                    </div>
                    {progress !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>{progress.toFixed(1)}%</span>
                          <span>{formatRupiah(aktif)} / {formatRupiah(target!)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: g.color ?? "#3b82f6" }} />
                        </div>
                        {g.target_date && target && aktif < target && (
                          <p className="text-xs text-muted-foreground">
                            {(() => {
                              const bulanSisa = Math.max(1, Math.ceil((new Date(g.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)))
                              return `Butuh ~${formatRupiah((target - aktif) / bulanSisa)}/bulan (${bulanSisa} bulan lagi)`
                            })()}
                          </p>
                        )}
                      </div>
                    )}
                    <Button asChild variant="outline" size="sm" className="w-full">
                      <Link href={`/investasi/kantong/${g.id}`}><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Lihat Detail</Link>
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
