export const dynamic = "force-dynamic"

import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { getInvestmentTxList } from "@/lib/tx-list"
import { parsePageParams, buildParamsStr, totalPages } from "@/lib/paginate"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SearchInput } from "@/components/ui/search-input"
import { LimitSelect } from "@/components/ui/limit-select"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { TxFilterBar } from "@/components/ui/tx-filter-bar"
import { TrendingUp, TrendingDown, Coins, ArrowLeft } from "lucide-react"
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
  { value: "BUY",      label: "Beli (BUY)" },
  { value: "SELL",     label: "Jual (SELL)" },
  { value: "DIVIDEND", label: "Dividen" },
]

export default async function InvestmentTxPage({
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

  const { items, total } = await getInvestmentTxList(userId, {
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
          <h1 className="text-xl font-semibold">Semua Transaksi Investasi</h1>
          <p className="text-sm text-muted-foreground">{total} transaksi</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput defaultValue={pp.search} paramsStr={paramsStr} placeholder="Cari aset / kantong..." />
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
                const isBuy      = t.txType === "BUY"
                const isDividend = t.txType === "DIVIDEND"
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isBuy      ? "bg-primary/10" :
                      isDividend ? "bg-teal-100 dark:bg-teal-900/20" :
                                   "bg-orange-100 dark:bg-orange-900/20"
                    }`}>
                      {isBuy      && <TrendingUp   className="h-4 w-4 text-primary" />}
                      {!isBuy && !isDividend && <TrendingDown className="h-4 w-4 text-orange-500" />}
                      {isDividend && <Coins        className="h-4 w-4 text-teal-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.investmentName}</p>
                        {isBuy      && <Badge variant="default"  className="text-[10px] h-4 px-1.5 shrink-0">Beli</Badge>}
                        {!isBuy && !isDividend && <Badge variant="warning" className="text-[10px] h-4 px-1.5 shrink-0">Jual</Badge>}
                        {isDividend && <Badge variant="outline"  className="text-[10px] h-4 px-1.5 shrink-0 bg-teal-500 text-white border-transparent">Dividen</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {fmtDate(t.date)}{t.goalName ? ` · ${t.goalName}` : ""}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums shrink-0 ${
                      isBuy      ? "text-destructive" :
                      isDividend ? "text-teal-600" :
                                   "text-primary"
                    }`}>
                      {isBuy ? "-" : "+"}{formatRp(t.amount)}
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
