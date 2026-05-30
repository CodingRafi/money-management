import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { pool } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, X, Wallet } from "lucide-react"
import Link from "next/link"
import { WalletForm } from "./_components/wallet-form"
import { createWallet, updateWallet, deleteWallet } from "@/app/actions/wallets"

type WalletCategory = { id: string; name: string; is_liquid: boolean }
type WalletRow = {
  id: string
  category_id: string
  category_name: string
  category_is_liquid: boolean
  name: string
  is_liquid: boolean
  color: string | null
}

export default async function DompetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const userId = session.user.id

  const sp      = await searchParams
  const showNew = sp.new === "1"
  const editId  = typeof sp.edit === "string" ? sp.edit : null

  const [categoriesRes, walletsRes] = await Promise.all([
    pool.query<WalletCategory>(
      `SELECT id, name, is_liquid FROM wallet_categories ORDER BY sort_order, name`,
    ),
    pool.query<WalletRow>(
      `SELECT w.id, w.category_id, wc.name AS category_name, wc.is_liquid AS category_is_liquid,
              w.name, w.is_liquid, w.color
       FROM wallets w
       JOIN wallet_categories wc ON wc.id = w.category_id
       WHERE w.user_id = $1 AND w.is_active = true
       ORDER BY wc.sort_order, w.sort_order, w.name`,
      [userId],
    ),
  ])

  const categories = categoriesRes.rows
  const wallets    = walletsRes.rows

  // Group by category_id
  const byCategory = wallets.reduce<Record<string, WalletRow[]>>((acc, w) => {
    acc[w.category_id] ??= []
    acc[w.category_id].push(w)
    return acc
  }, {})

  // Only show categories that have at least one wallet
  const usedCats = categories.filter((c) => byCategory[c.id]?.length)

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

      {/* Add form */}
      {showNew && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Tambah Dompet Baru</CardTitle>
              <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                <Link href="/dompet">
                  <X className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <WalletForm categories={categories} action={createWallet} cancelHref="/dompet" />
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
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

      {/* Wallet list grouped by category */}
      {usedCats.map((cat) => (
        <Card key={cat.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.name}
              </CardTitle>
              <Badge variant={cat.is_liquid ? "default" : "secondary"} className="text-xs">
                {cat.is_liquid ? "Liquid" : "Tidak Liquid"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(byCategory[cat.id] ?? []).map((w) =>
              editId === w.id ? (
                <div
                  key={w.id}
                  className="rounded-lg border border-primary/40 bg-muted/30 p-4"
                >
                  <WalletForm
                    categories={categories}
                    action={updateWallet.bind(null, w.id)}
                    defaultValues={{
                      name:     w.name,
                      categoryId: w.category_id,
                      isLiquid: w.is_liquid,
                      color:    w.color ?? undefined,
                    }}
                    isEdit
                    cancelHref="/dompet"
                  />
                </div>
              ) : (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {w.color && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: w.color }}
                      />
                    )}
                    <p className="truncate font-medium">{w.name}</p>
                    {w.is_liquid !== cat.is_liquid && (
                      <Badge
                        variant={w.is_liquid ? "default" : "outline"}
                        className="shrink-0 text-xs"
                      >
                        {w.is_liquid ? "Liquid" : "Tidak Liquid"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <Link href={`?edit=${w.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <form action={deleteWallet.bind(null, w.id)}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
