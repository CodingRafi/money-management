export const dynamic = "force-dynamic"

import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { getCashflowTxList } from "@/lib/tx-list"
import { parsePageParams, buildParamsStr, totalPages } from "@/lib/paginate"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SearchInput } from "@/components/ui/search-input"
import { LimitSelect } from "@/components/ui/limit-select"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { TxFilterBar } from "@/components/ui/tx-filter-bar"
import { ArrowDown, ArrowUp, ArrowLeftRight, ArrowLeft } from "lucide-react"
import Link from "next/link"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  })
}

const TYPE_OPTIONS = [
  { value: "INCOME",   label: "Pemasukan" },
  { value: "EXPENSE",  label: "Pengeluaran" },
  { value: "TRANSFER", label: "Transfer" },
]

const TYPE_ICON = {
  INCOME:   { icon: ArrowDown,      bg: "bg-primary/10",     color: "text-primary" },
  EXPENSE:  { icon: ArrowUp,        bg: "bg-destructive/10", color: "text-destructive" },
  TRANSFER: { icon: ArrowLeftRight, bg: "bg-muted",          color: "text-muted-foreground" },
}

const TYPE_BADGE: Record<string, "default" | "success" | "destructive"> = {
  INCOME: "success", EXPENSE: "destructive", TRANSFER: "default",
}
const TYPE_LABEL = { INCOME: "Pemasukan", EXPENSE: "Pengeluaran", TRANSFER: "Transfer" }

export default async function CashflowListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = LOCAL_USER_ID
  const sp = await searchParams
  const pp = parsePageParams(sp)
  const from = typeof sp.from === "string" ? sp.from : ""
  const to   = typeof sp.to   === "string" ? sp.to   : ""
  const type = typeof sp.type === "string" ? sp.type : "all"
  const paramsStr = buildParamsStr(sp)

  const { items, total } = getCashflowTxList(userId, {
    from: from || undefined,
    to:   to   || undefined,
    type,
    search: pp.search || undefined,
    page:  pp.page,
    limit: pp.limit,
  })

  const pages = totalPages(total, pp.limit)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold">Semua Transaksi Cashflow</h1>
          <p className="text-sm text-muted-foreground">{total} transaksi</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput defaultValue={pp.search} paramsStr={paramsStr} placeholder="Cari nama..." />
        <TxFilterBar from={from} to={to} type={type} paramsStr={paramsStr} typeOptions={TYPE_OPTIONS} />
        <div className="ml-auto">
          <LimitSelect currentLimit={pp.limit} paramsStr={paramsStr} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Tidak ada transaksi ditemukan.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map(t => {
                const cfg  = TYPE_ICON[t.txType]
                const Icon = cfg.icon
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.name}</p>
                        <Badge variant={TYPE_BADGE[t.txType]} className="text-[10px] h-4 px-1.5 shrink-0">
                          {TYPE_LABEL[t.txType]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {fmtDate(t.date)}{t.cat ? ` · ${t.cat}` : ""}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums shrink-0 ${
                      t.txType === "TRANSFER"
                        ? "text-foreground"
                        : t.isCredit ? "text-primary" : "text-destructive"
                    }`}>
                      {t.txType !== "TRANSFER" && (t.isCredit ? "+" : "-")}{formatRp(t.amount)}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <PaginationBar page={pp.page} totalPages={pages} total={total} limit={pp.limit} paramsStr={paramsStr} />
    </div>
  )
}
