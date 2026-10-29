import { db } from "@/lib/db"
import { requireUserId } from "@/lib/session"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, X, Wallet } from "lucide-react"
import Link from "next/link"
import { WalletForm } from "./_components/wallet-form"
import { createWallet, updateWallet, deleteWallet } from "@/app/actions/wallets"

type WalletCategory = { id: string; name: string }
type WalletRow = {
  id: string
  category_id: string
  category_name: string
  name: string
  color: string | null
}

export default async function DompetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = await requireUserId()

  const sp       = await searchParams
  const showNew  = sp.new === "1"
  const editId   = typeof sp.edit === "string" ? sp.edit : null

  const categories = await db.prepare<[], WalletCategory>(
    "SELECT id, name FROM wallet_categories ORDER BY sort_order, name"
  ).all() as WalletCategory[]

  const wallets = await db.prepare<[string], WalletRow>(
    `SELECT w.id, w.category_id, wc.name AS category_name,
            w.name, w.color
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dompet</h1>
          <p className="text-sm text-muted-foreground">Dompet pribadimu — hanya sebagai label sumber arus kas</p>
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
        return (
          <Card key={cat.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.name}
                </CardTitle>
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
                ) : (
                  <div key={w.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {w.color && (
                        <span className="h-3 w-3 shrink-0 rounded-full border" style={{ backgroundColor: w.color }} />
                      )}
                      <p className="truncate font-medium">{w.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex items-center gap-1">
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
