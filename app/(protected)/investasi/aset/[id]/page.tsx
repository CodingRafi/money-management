import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Trash2, Pencil, X } from "lucide-react"
import Link from "next/link"
import { AssetForm } from "../../_components/asset-form"
import { TransactionForm } from "../../_components/transaction-form"
import { calcProfitLoss } from "@/lib/investment"
import {
  updateInvestmentDirect,
  deleteInvestmentDirect,
  addInvestmentTransactionDirect,
  deleteInvestmentTransactionDirect,
} from "@/app/actions/investments"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

function formatQty(qty: string | number) {
  const n = parseFloat(String(qty))
  if (isNaN(n)) return String(qty)
  return n % 1 === 0 ? n.toLocaleString("id-ID") : n.toLocaleString("id-ID", { maximumFractionDigits: 8 })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

type AssetDetail = {
  id: string; name: string; notes: string | null; is_liquid: number
  category_name: string; wallet_id: string | null; wallet_name: string | null
}
type TxRow = {
  id: string; type: string; quantity: number; price_per_unit: number; total_amount: number
  date: string; notes: string | null; goal_name: string | null
  from_wallet_name: string | null; to_wallet_name: string | null
}

const STATUS_CLASS: Record<string, string> = {
  PROFIT:     "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  LOSS:       "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  HOLDING:    "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  BREAK_EVEN: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
}

export default async function AsetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = LOCAL_USER_ID
  const { id: investmentId } = await params
  const isActive = true

  const sp      = await searchParams
  const showNew = sp.new === "1"
  const isEdit  = sp.edit === "1"

  const asset = db.prepare<[string, string], AssetDetail>(
    `SELECT i.id, i.name, i.notes, i.is_liquid, ic.name AS category_name, i.wallet_id, w.name AS wallet_name
     FROM investments i
     JOIN investment_categories ic ON ic.id = i.category_id
     LEFT JOIN wallets w ON w.id = i.wallet_id
     WHERE i.id = ? AND i.user_id = ? AND i.is_active = 1`
  ).get(investmentId, userId) as AssetDetail | undefined
  if (!asset) redirect("/investasi")

  const txs = db.prepare<[string], TxRow>(
    `SELECT it.id, it.type, it.quantity, it.price_per_unit, it.total_amount,
            it.date, it.notes, g.name AS goal_name,
            fw.name AS from_wallet_name, tw.name AS to_wallet_name
     FROM investment_transactions it
     LEFT JOIN investment_goals g ON g.id = it.goal_id
     LEFT JOIN wallets fw ON fw.id = it.from_wallet_id
     LEFT JOIN wallets tw ON tw.id = it.to_wallet_id
     WHERE it.investment_id = ?
     ORDER BY it.date DESC, it.created_at DESC`
  ).all(investmentId) as TxRow[]

  const wallets = db.prepare<[string], { id: string; name: string }>(
    "SELECT id, name FROM wallets WHERE user_id=? AND is_active=1 ORDER BY sort_order"
  ).all(userId) as { id: string; name: string }[]

  const goals = db.prepare<[string], { id: string; name: string; color: string | null }>(
    "SELECT id, name, color FROM investment_goals WHERE user_id=? AND is_active=1 ORDER BY sort_order, created_at"
  ).all(userId) as { id: string; name: string; color: string | null }[]

  // calcProfitLoss expects total_amount as number
  const plTxs = txs.map((t) => ({ ...t, total_amount: String(t.total_amount), quantity: String(t.quantity), price_per_unit: String(t.price_per_unit) }))
  const pl      = calcProfitLoss(plTxs)
  const qtyHeld = txs.reduce((s, t) => {
    const q = t.quantity
    return t.type === "BUY" ? s + q : s - q
  }, 0)

  const cancelHref = `/investasi/aset/${investmentId}`

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
            <Link href="/investasi"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{asset.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-sm text-muted-foreground">
              <span>{asset.category_name}</span>
              {asset.wallet_name && <><span>·</span><span>{asset.wallet_name}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`${cancelHref}?edit=1`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Link>
          </Button>
          <form action={deleteInvestmentDirect.bind(null, investmentId)}>
            <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/30">
              <Trash2 className="h-3.5 w-3.5 mr-1" />Hapus
            </Button>
          </form>
        </div>
      </div>

      {isEdit && (
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">Edit Aset</p>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                <Link href={cancelHref}>Batal</Link>
              </Button>
            </div>
            <AssetForm
              categories={[]}
              wallets={wallets}
              action={updateInvestmentDirect.bind(null, investmentId)}
              defaultValues={{ name: asset.name, walletId: asset.wallet_id, isLiquid: !!asset.is_liquid, notes: asset.notes }}
              isEdit
              cancelHref={cancelHref}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Total Modal</p><p className="font-bold text-blue-600 tabular-nums">{formatRupiah(pl.totalModal)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Total Hasil</p><p className="font-bold text-emerald-600 tabular-nums">{formatRupiah(pl.totalHasil)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">P/L Direalisasi</p><p className={`font-bold tabular-nums ${pl.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pl.profitLoss >= 0 ? "+" : ""}{formatRupiah(pl.profitLoss)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Status</p><span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[pl.status]}`}>{pl.status}</span></CardContent></Card>
      </div>

      {qtyHeld > 0 && (
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Quantity Dipegang</p><p className="font-bold tabular-nums">{formatQty(qtyHeld)}</p></CardContent></Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Riwayat Transaksi</h2>
          {!showNew && (
            <Button asChild size="sm"><Link href={`${cancelHref}?new=1`}><Plus className="h-4 w-4 mr-1" />Tambah Transaksi</Link></Button>
          )}
        </div>

        {showNew && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium">Tambah Transaksi</p>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href={cancelHref}><X className="h-4 w-4" /></Link></Button>
              </div>
              <TransactionForm wallets={wallets} goals={goals} action={addInvestmentTransactionDirect.bind(null, investmentId)} cancelHref={cancelHref} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {txs.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada transaksi. <Link href={`${cancelHref}?new=1`} className="text-primary underline underline-offset-2">Tambah transaksi pertama</Link>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                      <th className="px-4 py-3 text-left font-medium">Tipe</th>
                      <th className="px-4 py-3 text-right font-medium">Qty</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-left font-medium">Dompet</th>
                      <th className="px-4 py-3 text-left font-medium">Kantong</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="px-4 py-3"><Badge variant={tx.type === "BUY" ? "default" : "destructive"} className="text-xs">{tx.type}</Badge></td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatQty(tx.quantity)}</td>
                        <td className={`px-4 py-3 text-right tabular-nums font-medium ${tx.type === "BUY" ? "text-blue-600" : "text-emerald-600"}`}>{formatRupiah(tx.total_amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{tx.type === "BUY" ? (tx.from_wallet_name ?? "—") : (tx.to_wallet_name ?? "—")}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{tx.goal_name ?? "—"}</td>
                        <td className="px-3 py-3 text-right">
                          <form action={deleteInvestmentTransactionDirect.bind(null, tx.id, investmentId)}>
                            <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20">
                      <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total Modal Aktif</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-emerald-600">{formatRupiah(pl.totalModal - pl.totalHasil)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {asset.notes && (
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Catatan</p><p className="text-sm">{asset.notes}</p></CardContent></Card>
      )}
    </div>
  )
}
