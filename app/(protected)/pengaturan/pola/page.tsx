export const dynamic = "force-dynamic"

import Link from "next/link"
import { Repeat } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PERMISSION } from "@/lib/permissions"
import { requireScope } from "@/lib/scope"
import { requirePermission, sessionHasPermission } from "@/lib/session"
import { rupiah } from "@/lib/utils"
import { recurringService } from "@/services/recurring.service"
import {
  confirmPattern, deletePattern, ignorePattern, togglePatternActive, updatePattern,
} from "@/app/actions/recurring"

function confidenceBadge(c: number) {
  const variant = c >= 0.8 ? "success" : c >= 0.55 ? "warning" : "secondary"
  return <Badge variant={variant}>{Math.round(c * 100)}%</Badge>
}

export default async function PolaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requirePermission(PERMISSION.CASHFLOW.VIEW)
  const scope = await requireScope()
  const sp = await searchParams
  const tab = sp.tab === "tersimpan" ? "tersimpan" : "ditemukan"
  const showAll = sp.all === "1"
  const canWrite = !scope.readOnly && sessionHasPermission(session, PERMISSION.CASHFLOW.CREATE)
  const ownerName = new Map(scope.members.map((m) => [m.user_id, m.name]))
  const showOwner = scope.userIds.length > 1

  const [candidates, saved] = await Promise.all([
    tab === "ditemukan" ? recurringService.detect(scope.userIds, { minConfidence: showAll ? 0.3 : 0.55 }) : Promise.resolve([]),
    tab === "tersimpan" ? recurringService.list(scope.userIds) : Promise.resolve([]),
  ])

  const tabLink = (key: string, label: string) => (
    <Link
      href={`?tab=${key}`}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  )

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start gap-3">
        <Repeat className="h-6 w-6 mt-1 text-muted-foreground shrink-0" />
        <div>
          <h1 className="text-2xl font-bold">Transaksi Berulang</h1>
          <p className="text-sm text-muted-foreground">
            Pola tagihan/pemasukan rutin yang ditemukan dari histori. Setujui agar diingatkan bila bulan ini belum dicatat.
          </p>
        </div>
      </div>

      <div className="flex border-b">
        {tabLink("ditemukan", "Ditemukan")}
        {tabLink("tersimpan", "Tersimpan")}
      </div>

      {tab === "ditemukan" && (
        <div className="space-y-3">
          {candidates.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">
              Belum ada pola baru yang meyakinkan. Pola muncul setelah transaksi serupa tercatat di minimal 2–3 bulan.
            </CardContent></Card>
          ) : (
            candidates.map((c, i) => {
              const mine = c.userId === session.userId
              const payload = JSON.stringify({
                kind: c.kind, name: c.name, categoryId: c.categoryId, walletId: c.walletId, needsType: c.needsType,
                isFamilyExpense: c.isFamilyExpense, amountAvg: c.amountAvg, amountMin: c.amountMin, amountMax: c.amountMax,
                occurrences: c.occurrences, dayOfMonth: c.dayOfMonth, confidence: c.confidence, lastSeenDate: c.lastSeenDate,
              })
              return (
                <Card key={`${c.userId}-${i}`}>
                  <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{c.name}</p>
                        <Badge variant={c.kind === "INCOME" ? "success" : "outline"}>{c.kind === "INCOME" ? "Pemasukan" : "Pengeluaran"}</Badge>
                        {confidenceBadge(c.confidence)}
                        {showOwner && <span className="text-xs text-muted-foreground">{ownerName.get(c.userId) ?? ""}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {c.categoryName ?? "Tanpa kategori"} · rata-rata {rupiah(c.amountAvg)} · tiap tanggal {c.dayOfMonth} · {c.occurrences}× tercatat
                      </p>
                    </div>
                    {canWrite && mine && (
                      <form className="flex items-center gap-2">
                        <input type="hidden" name="payload" value={payload} />
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input type="checkbox" name="auto_post" /> Catat otomatis
                        </label>
                        <Button size="sm" formAction={confirmPattern}>Setujui</Button>
                        <Button size="sm" variant="outline" formAction={ignorePattern}>Abaikan</Button>
                      </form>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
          {!showAll && (
            <Link href="?tab=ditemukan&all=1" className="text-xs text-muted-foreground hover:underline">
              Lihat semua (termasuk yang kurang meyakinkan)
            </Link>
          )}
        </div>
      )}

      {tab === "tersimpan" && (
        <div className="space-y-3">
          {saved.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Belum ada pola tersimpan.</CardContent></Card>
          ) : (
            saved.map((p) => {
              const mine = p.user_id === session.userId
              return (
                <Card key={p.id} className={p.is_active ? "" : "opacity-60"}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{p.name}</p>
                          <Badge variant={p.kind === "INCOME" ? "success" : "outline"}>{p.kind === "INCOME" ? "Pemasukan" : "Pengeluaran"}</Badge>
                          {!p.is_active && <Badge variant="secondary">Diabaikan</Badge>}
                          {p.auto_post === 1 && <Badge variant="warning">Otomatis</Badge>}
                          {showOwner && <span className="text-xs text-muted-foreground">{ownerName.get(p.user_id) ?? ""}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {p.category_name ?? "Tanpa kategori"} · {rupiah(Number(p.amount_avg))} · tanggal {p.day_of_month}
                        </p>
                      </div>
                      {canWrite && mine && (
                        <div className="flex gap-2">
                          <form action={togglePatternActive.bind(null, p.id, !p.is_active)}>
                            <Button size="sm" variant="outline">{p.is_active ? "Nonaktifkan" : "Aktifkan"}</Button>
                          </form>
                          <form action={deletePattern.bind(null, p.id)}>
                            <Button size="sm" variant="ghost">Hapus</Button>
                          </form>
                        </div>
                      )}
                    </div>
                    {canWrite && mine && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Edit</summary>
                        <form action={updatePattern.bind(null, p.id)} className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_90px_auto_auto] items-center">
                          <Input name="name" defaultValue={p.name} required maxLength={200} />
                          <Input name="amount" type="number" min={1} step="any" defaultValue={Math.round(Number(p.amount_avg))} required />
                          <Input name="day" type="number" min={1} max={31} defaultValue={p.day_of_month} required />
                          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <input type="checkbox" name="auto_post" defaultChecked={p.auto_post === 1} /> Otomatis
                          </label>
                          <Button size="sm">Simpan</Button>
                        </form>
                      </details>
                    )}
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
