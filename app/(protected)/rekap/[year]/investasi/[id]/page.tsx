import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Trash2, Pencil } from "lucide-react"
import Link from "next/link"
import { InvestmentAssetForm } from "../../_components/investment-asset-form"
import { InvestmentTransactionForm } from "../../_components/investment-transaction-form"
import { calcProfitLoss } from "@/lib/investment"
import {
  addInvestmentTransaction,
  deleteInvestmentTransaction,
  updateInvestment,
  deleteInvestment,
} from "@/app/actions/investments"

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

function formatQty(qty: string, unit: string | null) {
  const n = Number(qty)
  const formatted = n % 1 === 0
    ? n.toLocaleString("id-ID")
    : n.toLocaleString("id-ID", { maximumFractionDigits: 8 })
  return unit ? `${formatted} ${unit}` : formatted
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })
}

type InvestmentDetail = {
  id: string
  name: string
  unit: string | null
  notes: string | null
  category_name: string
  wallet_name: string | null
}

type TxRow = {
  id: string
  type: string
  quantity: string
  price_per_unit: string
  total_amount: string
  date: string
  notes: string | null
  from_wallet_name: string | null
  to_wallet_name: string | null
}

const STATUS_CLASS: Record<string, string> = {
  PROFIT:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  LOSS:        "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  HOLDING:     "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
  BREAK_EVEN:  "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400",
}

export default async function InvestasiDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const { year: yearStr, id: investmentId } = await params
  const year = parseInt(yearStr)
  if (isNaN(year)) redirect("/rekap")

  const sp      = await searchParams
  const showNew = sp.new === "1"
  const isEdit  = sp.edit === "1"

  const invRes = await pool.query<InvestmentDetail>(
    `SELECT i.id, i.name, i.unit, i.notes,
            ic.name AS category_name,
            w.name  AS wallet_name
     FROM investments i
     JOIN investment_categories ic ON ic.id = i.category_id
     LEFT JOIN wallets w ON w.id = i.wallet_id
     WHERE i.id = $1 AND i.user_id = $2 AND i.is_active = true`,
    [investmentId, userId],
  )
  if (!invRes.rows[0]) redirect(`/rekap/${yearStr}?tab=investasi`)
  const investment = invRes.rows[0]

  const [yearTxRes, allTxRes, walletsRes] = await Promise.all([
    pool.query<TxRow>(
      `SELECT it.id, it.type,
              it.quantity::text, it.price_per_unit::text, it.total_amount::text,
              it.date::text, it.notes,
              fw.name AS from_wallet_name,
              tw.name AS to_wallet_name
       FROM investment_transactions it
       LEFT JOIN wallets fw ON fw.id = it.from_wallet_id
       LEFT JOIN wallets tw ON tw.id = it.to_wallet_id
       WHERE it.investment_id = $1 AND it.year = $2
       ORDER BY it.date DESC, it.created_at DESC`,
      [investmentId, year],
    ),
    pool.query<{ type: string; total_amount: string }>(
      `SELECT type, total_amount::text FROM investment_transactions WHERE investment_id=$1`,
      [investmentId],
    ),
    pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM wallets WHERE user_id=$1 AND is_active=true ORDER BY sort_order`,
      [userId],
    ),
  ])

  const yearTx   = yearTxRes.rows
  const pl       = calcProfitLoss(allTxRes.rows)
  const wallets  = walletsRes.rows

  const backHref   = `/rekap/${yearStr}?tab=investasi`
  const cancelHref = `/rekap/${yearStr}/investasi/${investmentId}`

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{investment.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-sm text-muted-foreground">
              <span>{investment.category_name}</span>
              {investment.unit     && <><span>·</span><span>{investment.unit}</span></>}
              {investment.wallet_name && <><span>·</span><span>{investment.wallet_name}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`${cancelHref}?edit=1`}>
              <Pencil className="h-3.5 w-3.5 mr-1" />Edit
            </Link>
          </Button>
          <form action={deleteInvestment.bind(null, investmentId, yearStr)}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />Hapus
            </Button>
          </form>
        </div>
      </div>

      {/* Edit form */}
      {isEdit && (
        <Card>
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-medium">Edit Aset</p>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                <Link href={cancelHref}>Batal</Link>
              </Button>
            </div>
            <InvestmentAssetForm
              categories={[]}
              wallets={wallets}
              action={updateInvestment.bind(null, investmentId, yearStr)}
              defaultValues={{
                name:     investment.name,
                unit:     investment.unit,
                notes:    investment.notes,
              }}
              isEdit
              cancelHref={cancelHref}
            />
          </CardContent>
        </Card>
      )}

      {/* All-time summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Modal</p>
            <p className="font-bold text-blue-600 tabular-nums">{formatRupiah(pl.totalModal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Hasil</p>
            <p className="font-bold text-emerald-600 tabular-nums">{formatRupiah(pl.totalHasil)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">P/L Keseluruhan</p>
            <p className={`font-bold tabular-nums ${pl.profitLoss >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {pl.profitLoss >= 0 ? "+" : ""}{formatRupiah(pl.profitLoss)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Status</p>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[pl.status]}`}>
              {pl.status}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Year transactions */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Transaksi {year}</h2>
          {!showNew && (
            <Button asChild size="sm">
              <Link href={`${cancelHref}?new=1`}>
                <Plus className="h-4 w-4 mr-1" />Tambah Transaksi
              </Link>
            </Button>
          )}
        </div>

        {showNew && (
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium">Tambah Transaksi</p>
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                  <Link href={cancelHref}>Batal</Link>
                </Button>
              </div>
              <InvestmentTransactionForm
                wallets={wallets}
                action={addInvestmentTransaction.bind(null, investmentId, yearStr)}
                cancelHref={cancelHref}
                year={year}
                unit={investment.unit}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {yearTx.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada transaksi untuk tahun {year}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                      <th className="px-4 py-3 text-left font-medium">Tipe</th>
                      <th className="px-4 py-3 text-right font-medium">Quantity</th>
                      <th className="px-4 py-3 text-right font-medium">Harga/Unit</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-left font-medium">Dompet</th>
                      <th className="px-4 py-3 text-left font-medium">Catatan</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {yearTx.map((tx) => (
                      <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={tx.type === "BUY" ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {tx.type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatQty(tx.quantity, investment.unit)}
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
                          {tx.type === "BUY"
                            ? (tx.from_wallet_name ?? "—")
                            : (tx.to_wallet_name ?? "—")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {tx.notes ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <form action={deleteInvestmentTransaction.bind(null, tx.id, investmentId, yearStr)}>
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20">
                      <td colSpan={4} className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                        Total {year}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">
                        {formatRupiah(yearTx.reduce((s, t) => s + Number(t.total_amount), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {investment.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Catatan Aset</p>
            <p className="text-sm">{investment.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
