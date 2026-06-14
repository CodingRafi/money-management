import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getLoans, type LoanItem } from "@/lib/dashboard"
import Link from "next/link"
import { AlertCircle, ChevronRight } from "lucide-react"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

function LoanList({ items, type }: { items: LoanItem[]; type: "PIUTANG" | "HUTANG" }) {
  return (
    <ul className="space-y-2">
      {items.map(item => (
        <li key={item.id} className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium truncate">{item.name}</p>
              {item.status === "TERLAMBAT" && (
                <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />
              )}
            </div>
            {item.dueDate && (
              <p className="text-xs text-muted-foreground">
                Jatuh tempo {formatDate(item.dueDate)}
              </p>
            )}
            {type === "HUTANG" && item.cicilanPerBulan !== null && (
              <p className="text-xs text-muted-foreground">
                Cicilan {formatRp(item.cicilanPerBulan)}/bln
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-semibold tabular-nums">{formatRp(item.sisa)}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export async function LoanSection({ userId }: { userId: string }) {
  const data = await getLoans(userId)

  const hasAny = data.piutang.items.length > 0 || data.hutang.items.length > 0

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Pinjaman</CardTitle>
          {data.terlambatCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {data.terlambatCount} terlambat
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {!hasAny ? (
          <p className="text-sm text-muted-foreground">Tidak ada pinjaman aktif</p>
        ) : (
          <div className="space-y-4">
            {data.piutang.items.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Piutang
                  </p>
                  <p className="text-xs font-semibold tabular-nums">
                    {formatRp(data.piutang.totalSisa)}
                  </p>
                </div>
                <LoanList items={data.piutang.items} type="PIUTANG" />
              </div>
            )}

            {data.piutang.items.length > 0 && data.hutang.items.length > 0 && (
              <div className="border-t border-border" />
            )}

            {data.hutang.items.length > 0 && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Hutang
                  </p>
                  <p className="text-xs font-semibold tabular-nums text-destructive">
                    {formatRp(data.hutang.totalSisa)}
                  </p>
                </div>
                <LoanList items={data.hutang.items} type="HUTANG" />
              </div>
            )}
          </div>
        )}
      </CardContent>
      <div className="px-6 pb-4 pt-2">
        <Link
          href="/pinjaman"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Lihat semua <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  )
}

export function LoanSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-20 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex justify-between animate-pulse">
            <div className="space-y-1">
              <div className="h-3 w-28 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
