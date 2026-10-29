import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getWallets } from "@/lib/dashboard"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase()
}

export async function WalletSection({ userId }: { userId: string }) {
  const data = await getWallets(userId)

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Dompet</CardTitle>
          {data.activeCount > 5 && (
            <span className="text-xs text-muted-foreground">{data.activeCount} total</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada dompet — tambahkan sekarang
          </p>
        ) : (
          <ul className="space-y-3">
            {data.items.map(w => (
              <li key={w.id} className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: w.color ?? "#94a3b8" }}
                >
                  {initials(w.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium truncate">{w.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {w.isLiquid ? "Liquid" : "Non-liquid"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <div className="px-6 pb-4 pt-2">
        <Link
          href="/dompet"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Lihat semua <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  )
}

export function WalletSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="flex justify-between">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-3 w-20 bg-muted rounded" />
              </div>
              <div className="h-3 w-12 bg-muted rounded" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
