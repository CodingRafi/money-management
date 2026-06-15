import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, X, Wallet, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { WalletForm } from "./_components/wallet-form"
import { createWallet, updateWallet, deleteWallet, adjustBalance } from "@/app/actions/wallets"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

type WalletCategory = { id: string; name: string }
type WalletRow = {
  id: string
  category_id: string
  category_name: string
  name: string
  color: string | null
  balance: number
}

export default async function DompetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = LOCAL_USER_ID

  const sp       = await searchParams
  const showNew  = sp.new === "1"
  const editId   = typeof sp.edit === "string" ? sp.edit : null
  const adjustId = typeof sp.adjust === "string" ? sp.adjust : null

  const categories = db.prepare<[], WalletCategory>(
    "SELECT id, name FROM wallet_categories ORDER BY sort_order, name"
  ).all() as WalletCategory[]

  const wallets = db.prepare<[string], WalletRow>(
    `SELECT w.id, w.category_id, wc.name AS category_name,
            w.name, w.color, w.balance
     FROM wallets w
     JOIN wallet_categories wc ON wc.id = w.category_id
     WHERE w.user_id = ? AND w.is_active = 1
     ORDER BY wc.sort_order, w.sort_order, w.name`
  ).all(userId) as WalletRow[]

  const byCategory = wallets.reduce<Record<string, WalletRow[]>>((acc, w) => {
    acc[w.category_id] ??= []
    acc[w.category_id].push(w)
    return acc
  }, {})

  const usedCats     = categories.filter((c) => byCategory[c.id]?.length)
  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0)

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dompet</h1>
          <p className="text-sm text-muted-foreground">Kelola semua akun keuangan kamu</p>
        </div>
        {!showNew && (
          <Button asChild size="sm">
            <Link href="?new=1">
              <Plus className="h-4 w-4 mr-1" />
              Tambah Dompet
            </Link>
          </Button>
        )}
      </div>

      {wallets.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Saldo</p>
            <p className={`text-lg font-bold tabular-nums ${totalBalance < 0 ? "text-red-600" : "text-blue-600"}`}>
              {formatRupiah(totalBalance)}
            </p>
          </CardContent>
        </Card>
      )}

      {showNew && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Tambah Dompet Baru</CardTitle>
              <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                <Link href="/dompet"><X className="h-4 w-4" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <WalletForm categories={categories} action={createWallet} cancelHref="/dompet" />
          </CardContent>
        </Card>
      )}

      {wallets.length === 0 && !showNew && (
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="mx-auto h-8 w-8 mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Belum ada dompet. Klik &quot;Tambah Dompet&quot; untuk mulai.
            </p>
          </CardContent>
        </Card>
      )}

      {usedCats.map((cat) => {
        const catWallets = byCategory[cat.id] ?? []
        const catTotal   = catWallets.reduce((s, w) => s + w.balance, 0)
        return (
          <Card key={cat.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.name}
                </CardTitle>
                <p className={`text-sm font-bold tabular-nums ${catTotal < 0 ? "text-red-600" : "text-foreground"}`}>
                  {formatRupiah(catTotal)}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {catWallets.map((w) =>
                editId === w.id ? (
                  <div key={w.id} className="rounded-lg border border-primary/40 bg-muted/30 p-4">
                    <WalletForm
                      categories={categories}
                      action={updateWallet.bind(null, w.id)}
                      defaultValues={{ name: w.name, categoryId: w.category_id, color: w.color ?? undefined }}
                      isEdit
                      cancelHref="/dompet"
                    />
                  </div>
                ) : adjustId === w.id ? (
                  <div key={w.id} className="rounded-lg border border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium">{w.name} — Sesuaikan Saldo</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Saldo tercatat: <span className="font-medium">{formatRupiah(w.balance)}</span>.
                        Masukkan saldo aktual sesuai rekening/dompet fisik.
                      </p>
                    </div>
                    <form action={adjustBalance.bind(null, w.id)} className="flex items-center gap-2">
                      <Input
                        name="target_balance"
                        type="number"
                        step="any"
                        defaultValue={w.balance}
                        className="h-8 max-w-[180px] text-sm"
                        autoFocus
                      />
                      <Button type="submit" size="sm" className="h-8">Simpan</Button>
                      <Button asChild variant="ghost" size="sm" className="h-8">
                        <Link href="/dompet">Batal</Link>
                      </Button>
                    </form>
                  </div>
                ) : (
                  <div key={w.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {w.color && (
                        <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: w.color }} />
                      )}
                      <p className="truncate font-medium">{w.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className={`tabular-nums font-semibold ${w.balance < 0 ? "text-red-600" : "text-foreground"}`}>
                        {formatRupiah(w.balance)}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Sesuaikan saldo">
                          <Link href={`?adjust=${w.id}`}><SlidersHorizontal className="h-4 w-4" /></Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                          <Link href={`?edit=${w.id}`}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <form action={deleteWallet.bind(null, w.id)}>
                          <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </div>
                  </div>
                )
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
