import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { deleteAnalysis } from "@/app/actions/fundamental"

type Row = {
  id: string; sector: string; stock_code: string; period: string
  result_data: string; created_at: string
}

function scoreColor(s: number) {
  if (s >= 80) return "text-emerald-600"
  if (s >= 65) return "text-blue-600"
  if (s >= 50) return "text-yellow-600"
  if (s >= 35) return "text-orange-600"
  return "text-red-600"
}

function scoreBg(s: number) {
  if (s >= 80) return "bg-emerald-500"
  if (s >= 65) return "bg-blue-500"
  if (s >= 50) return "bg-yellow-500"
  if (s >= 35) return "bg-orange-500"
  return "bg-red-500"
}

const SECTOR_LABEL: Record<string, string> = {
  BANK:             "Bank",
  TECH_GENERAL:     "Tech Umum",
  TECH_SAAS:        "SaaS",
  TECH_ECOMMERCE:   "E-Commerce",
  ENERGY_MIGAS:     "Migas",
  ENERGY_BATUBARA:  "Batu Bara",
  ENERGY_EBT:       "EBT",
}

const SECTOR_HREF: Record<string, string> = {
  BANK:             "/investasi/fundamental/bank",
  TECH_GENERAL:     "/investasi/fundamental/tech/general",
  TECH_SAAS:        "/investasi/fundamental/tech/saas",
  TECH_ECOMMERCE:   "/investasi/fundamental/tech/ecommerce",
  ENERGY_MIGAS:     "/investasi/fundamental/energy/migas",
  ENERGY_BATUBARA:  "/investasi/fundamental/energy/batubara",
  ENERGY_EBT:       "/investasi/fundamental/energy/ebt",
}

export default function FundamentalPage() {
  const userId = LOCAL_USER_ID
  const rows   = db.prepare<[string], Row>(
    "SELECT id, sector, stock_code, period, result_data, created_at FROM fundamental_analyses WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId) as Row[]

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
            <Link href="/investasi"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Kalkulator Fundamental</h1>
            <p className="text-sm text-muted-foreground">Analisis saham dari laporan keuangan — Bank & Teknologi</p>
          </div>
        </div>
        <Button asChild size="sm">
          <Link href="/investasi/fundamental/new"><Plus className="h-4 w-4 mr-1.5" />Analisis Baru</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <p className="text-muted-foreground text-sm">Belum ada analisis tersimpan.</p>
            <Button asChild size="sm">
              <Link href="/investasi/fundamental/new">Mulai Analisis Pertama</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const result       = JSON.parse(row.result_data)
            const score        = result.compositeScore as number
            const label        = result.label as string
            const detailHref   = `${SECTOR_HREF[row.sector] ?? "/investasi/fundamental"}/${row.id}`
            const sectorLabel  = SECTOR_LABEL[row.sector] ?? row.sector
            return (
              <Card key={row.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <Link href={detailHref}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <div className={`w-1 self-stretch rounded-sm ${scoreBg(score)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{row.stock_code}</p>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {sectorLabel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{row.period}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-2xl font-black tabular-nums ${scoreColor(score)}`}>{score.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  </Link>
                  <div className="border-t px-4 py-2 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <form action={deleteAnalysis.bind(null, row.id)}>
                      <Button type="submit" variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3 w-3 mr-1" />Hapus
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
