import { db } from "@/lib/db"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, X, ChevronRight, AlertCircle } from "lucide-react"
import Link from "next/link"
import { LoanForm } from "./_components/loan-form"
import { createLoan } from "@/app/actions/loans"
import { calcLoanStatus } from "@/lib/loan"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

type LoanRow = {
  id: string; type: string; name: string; description: string | null
  principal_amount: number; interest_rate: number; interest_type: string
  start_date: string; due_date: string | null; wallet_name: string
  status: string; total_pp: number; payment_likelihood: string | null
}

const LIKELIHOOD_LABEL: Record<string, string> = {
  LANCAR: "Bayar", MACET: "Kemungkinan Tidak Bayar",
}
const LIKELIHOOD_VARIANT: Record<string, "default" | "success" | "warning" | "destructive"> = {
  LANCAR: "success", MACET: "destructive",
}
type WalletRow = { id: string; name: string }

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ONGOING: "default", LUNAS: "success", TERLAMBAT: "destructive",
}

export default async function PinjamanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId = LOCAL_USER_ID
  const sp               = await searchParams
  const showNew          = sp.new === "1"
  const typeFilter       = typeof sp.type === "string"       ? sp.type       : "all"
  const statusFilter     = typeof sp.status === "string"     ? sp.status     : "all"
  const likelihoodFilter = typeof sp.likelihood === "string" ? sp.likelihood : "all"

  const allLoans = db.prepare<[string], LoanRow>(
    `SELECT l.id, l.type, l.name, l.description,
            l.principal_amount, l.interest_rate, l.interest_type,
            l.start_date, l.due_date, l.status, l.payment_likelihood, w.name AS wallet_name,
            COALESCE(SUM(lp.principal_paid), 0) AS total_pp
     FROM loans l
     JOIN wallets w ON w.id = l.wallet_id
     LEFT JOIN loan_payments lp ON lp.loan_id = l.id
     WHERE l.user_id = ? AND l.is_active = 1
     GROUP BY l.id ORDER BY l.created_at DESC`
  ).all(userId) as LoanRow[]

  const wallets = db.prepare<[string], WalletRow>(
    "SELECT id, name FROM wallets WHERE user_id=? AND is_active=1 AND is_liquid=1 ORDER BY sort_order"
  ).all(userId) as WalletRow[]

  const loans = allLoans
    .map((l) => {
      const remaining  = l.principal_amount - l.total_pp
      const liveStatus = calcLoanStatus(l.due_date, remaining)
      return { ...l, liveStatus, remaining }
    })
    .filter((l) => {
      if (typeFilter !== "all"       && l.type              !== typeFilter)       return false
      if (statusFilter !== "all"     && l.liveStatus        !== statusFilter)     return false
      if (likelihoodFilter !== "all" && l.payment_likelihood !== likelihoodFilter) return false
      return true
    })

  const piutang           = allLoans.filter((l) => l.type === "PIUTANG")
  const hutang            = allLoans.filter((l) => l.type === "HUTANG")
  const totalPiutangSisa  = piutang.reduce((s, l) => s + Math.max(0, l.principal_amount - l.total_pp), 0)
  const totalHutangSisa   = hutang.reduce((s, l)  => s + Math.max(0, l.principal_amount - l.total_pp), 0)
  const terlambat         = allLoans.filter((l) => calcLoanStatus(l.due_date, l.principal_amount - l.total_pp) === "TERLAMBAT")
  const piutangMacet      = piutang.filter((l) => l.payment_likelihood === "MACET")
  const totalMacetSisa    = piutangMacet.reduce((s, l) => s + Math.max(0, l.principal_amount - l.total_pp), 0)

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pinjaman</h1>
          <p className="text-sm text-muted-foreground">Kelola piutang dan hutang dengan cicilan</p>
        </div>
        {!showNew && (
          <Button asChild size="sm"><Link href="?new=1"><Plus className="h-4 w-4 mr-1" />Buat Pinjaman</Link></Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Sisa Piutang</p>
            <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatRupiah(totalPiutangSisa)}</p>
            <p className="text-xs text-muted-foreground mt-1">{piutang.length} pinjaman aktif</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Sisa Hutang</p>
            <p className="text-xl font-bold text-rose-600 tabular-nums">{formatRupiah(totalHutangSisa)}</p>
            <p className="text-xs text-muted-foreground mt-1">{hutang.length} pinjaman aktif</p>
          </CardContent>
        </Card>
        {piutangMacet.length > 0 && (
          <Card className="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/40">
            <CardContent className="p-4">
              <p className="text-xs text-rose-600 dark:text-rose-400 mb-1 font-medium">Piutang Macet</p>
              <p className="text-xl font-bold text-rose-600 tabular-nums">{formatRupiah(totalMacetSisa)}</p>
              <p className="text-xs text-muted-foreground mt-1">{piutangMacet.length} kemungkinan macet</p>
            </CardContent>
          </Card>
        )}
      </div>

      {terlambat.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">{terlambat.length} pinjaman melewati jatuh tempo</p>
            <p className="text-xs text-muted-foreground mt-0.5">{terlambat.map((l) => l.name).join(", ")}</p>
          </div>
        </div>
      )}

      {showNew && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Buat Pinjaman Baru</p>
              <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href="/pinjaman"><X className="h-4 w-4" /></Link></Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <LoanForm wallets={wallets} action={createLoan} cancelHref="/pinjaman" />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          {["all", "PIUTANG", "HUTANG"].map((t) => (
            <Link key={t} href={`?type=${t}&status=${statusFilter}&likelihood=${likelihoodFilter}`}
              className={`rounded-md px-3 py-1 text-xs font-medium border transition-colors ${typeFilter === t ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground border-border"}`}>
              {t === "all" ? "Semua" : t}
            </Link>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {["all", "ONGOING", "LUNAS", "TERLAMBAT"].map((s) => (
            <Link key={s} href={`?type=${typeFilter}&status=${s}&likelihood=${likelihoodFilter}`}
              className={`rounded-md px-3 py-1 text-xs font-medium border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground hover:text-foreground border-border"}`}>
              {s === "all" ? "Semua" : s}
            </Link>
          ))}
        </div>
      </div>

      {(typeFilter === "all" || typeFilter === "PIUTANG") && (
        <div className="flex gap-1 flex-wrap">
          <span className="text-xs text-muted-foreground self-center mr-1">Likelihood:</span>
          {["all", "LANCAR", "MACET"].map((lh) => {
            const cls = {
              LANCAR: "bg-emerald-600 text-white border-emerald-600",
              MACET:  "bg-rose-600 text-white border-rose-600",
            }[lh] ?? "bg-primary text-primary-foreground border-primary"
            return (
              <Link key={lh} href={`?type=${typeFilter}&status=${statusFilter}&likelihood=${lh}`}
                className={`rounded-md px-3 py-1 text-xs font-medium border transition-colors ${likelihoodFilter === lh ? cls : "text-muted-foreground hover:text-foreground border-border"}`}>
                {lh === "all" ? "Semua" : LIKELIHOOD_LABEL[lh]}
              </Link>
            )
          })}
        </div>
      )}

      {loans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {allLoans.length === 0
              ? <><span>Belum ada pinjaman.</span> <Link href="?new=1" className="text-primary underline underline-offset-2">Buat sekarang</Link>.</>
              : "Tidak ada pinjaman yang sesuai filter."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {loans.map((l) => {
              const progress = l.remaining <= 0 ? 100 : ((l.principal_amount - l.remaining) / l.principal_amount) * 100
              return (
                <Link key={l.id} href={`/pinjaman/${l.id}`}
                  className="flex items-center gap-4 px-4 py-4 hover:bg-muted/40 transition-colors">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{l.name}</span>
                      <Badge variant={l.type === "PIUTANG" ? "success" : "destructive"} className="text-[10px] px-1.5 py-0">{l.type}</Badge>
                      <Badge variant={STATUS_VARIANT[l.liveStatus] ?? "default"} className="text-[10px] px-1.5 py-0">{l.liveStatus}</Badge>
                      {l.type === "PIUTANG" && l.payment_likelihood && (
                        <Badge variant={LIKELIHOOD_VARIANT[l.payment_likelihood] ?? "default"} className="text-[10px] px-1.5 py-0">{LIKELIHOOD_LABEL[l.payment_likelihood]}</Badge>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>Pokok: {formatRupiah(l.principal_amount)}</span>
                      <span>Sisa: <span className="font-medium text-foreground">{formatRupiah(l.remaining)}</span></span>
                      {l.due_date && <span>Jatuh tempo: {formatDate(l.due_date)}</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${l.liveStatus === "TERLAMBAT" ? "bg-destructive" : l.liveStatus === "LUNAS" ? "bg-emerald-500" : "bg-primary"}`}
                        style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
