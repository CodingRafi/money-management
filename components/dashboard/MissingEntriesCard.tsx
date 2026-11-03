import Link from "next/link"
import { AlertCircle, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { rupiah } from "@/lib/utils"
import { recurringService } from "@/services/recurring.service"
import type { SessionData } from "@/lib/auth-simple"
import { markPatternHandled, recordPatternNow } from "@/app/actions/recurring"

const MAX_ITEMS = 5

/** Card "Perlu Dicatat": pola rutin yang jatuh tempo bulan ini tapi belum ada transaksinya. */
export async function MissingEntriesCard({
  userIds, session, canWrite, compact = false,
}: {
  userIds: string[]
  session: SessionData
  canWrite: boolean
  /** Sembunyikan card bila kosong (dashboard) alih-alih menampilkan pesan "semua beres". */
  compact?: boolean
}) {
  const currentUserId = session.userId
  // Pencatatan otomatis (lazy, idempoten per pola+bulan) sebelum menghitung yang belum tercatat.
  if (canWrite) await recurringService.postDue(session).catch((e) => console.error("[recurring] postDue:", e))
  const items = await recurringService.missingThisMonth(userIds)
  if (items.length === 0 && compact) return null
  const shown = items.slice(0, MAX_ITEMS)

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" /> Perlu Dicatat
        </CardTitle>
        <Link href="/pengaturan/pola?tab=tersimpan" className="text-xs text-muted-foreground hover:underline">Kelola pola</Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {shown.length === 0 && <p className="text-xs text-muted-foreground">Semua transaksi rutin bulan ini sudah tercatat.</p>}
        {shown.map((m) => {
          const day = Number(m.dueDate.slice(8, 10))
          const mine = m.userId === currentUserId
          return (
            <div key={m.patternId} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  {m.severity === "overdue"
                    ? <Badge variant="destructive">Terlambat {m.daysLate} hari</Badge>
                    : <Badge variant="warning"><Clock className="h-3 w-3 mr-1" />{m.daysLate === 0 ? "Hari ini" : `${-m.daysLate} hari lagi`}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Biasanya tanggal {day} ({rupiah(m.amount)}). Bulan ini belum tercatat.
                </p>
              </div>
              {canWrite && mine && (
                <div className="flex gap-1.5">
                  <form action={recordPatternNow.bind(null, m.patternId)}><Button size="sm">Catat sekarang</Button></form>
                  <form action={markPatternHandled.bind(null, m.patternId)}><Button size="sm" variant="outline">Tandai sudah</Button></form>
                </div>
              )}
            </div>
          )
        })}
        {items.length > shown.length && (
          <p className="text-xs text-muted-foreground">+{items.length - shown.length} lainnya</p>
        )}
      </CardContent>
    </Card>
  )
}
