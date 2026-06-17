export const dynamic = "force-dynamic"

import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { getLoanPaymentList } from "@/lib/tx-list"
import { parsePageParams, buildParamsStr, totalPages } from "@/lib/paginate"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SearchInput } from "@/components/ui/search-input"
import { LimitSelect } from "@/components/ui/limit-select"
import { PaginationBar } from "@/components/ui/pagination-bar"
import { TxFilterBar } from "@/components/ui/tx-filter-bar"
import { HandCoins, Wallet, ArrowLeft } from "lucide-react"
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
  { value: "PIUTANG", label: "Piutang (kamu pinjamkan)" },
  { value: "HUTANG",  label: "Hutang (kamu pinjam)" },
]

export default async function LoanPaymentPage({
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

  const { items, total } = getLoanPaymentList(userId, {
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
          <h1 className="text-xl font-semibold">Riwayat Pembayaran Pinjaman</h1>
          <p className="text-sm text-muted-foreground">{total} pembayaran</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput defaultValue={pp.search} paramsStr={paramsStr} placeholder="Cari nama pinjaman..." />
        <TxFilterBar from={from} to={to} type={type} paramsStr={paramsStr} typeOptions={TYPE_OPTIONS} />
        <div className="ml-auto">
          <LimitSelect currentLimit={pp.limit} paramsStr={paramsStr} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Tidak ada pembayaran ditemukan.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map(t => {
                const isPiutang = t.loanType === "PIUTANG"
                return (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isPiutang ? "bg-primary/10" : "bg-destructive/10"
                    }`}>
                      {isPiutang
                        ? <HandCoins className="h-4 w-4 text-primary" />
                        : <Wallet className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{t.loanName}</p>
                        <Badge
                          variant={isPiutang ? "success" : "destructive"}
                          className="text-[10px] h-4 px-1.5 shrink-0"
                        >
                          {isPiutang ? "Piutang" : "Hutang"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {fmtDate(t.date)}
                        {t.interestPaid > 0 ? ` · Bunga ${formatRp(t.interestPaid)}` : ""}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-semibold tabular-nums ${
                        isPiutang ? "text-primary" : "text-destructive"
                      }`}>
                        {isPiutang ? "+" : "-"}{formatRp(t.totalPaid)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        pokok {formatRp(t.principalPaid)}
                      </p>
                    </div>
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
