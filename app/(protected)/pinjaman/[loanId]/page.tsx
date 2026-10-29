import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { requireUserId } from "@/lib/session"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Trash2, Pencil, X } from "lucide-react"
import Link from "next/link"
import { LoanForm } from "../_components/loan-form"
import { PaymentForm } from "../_components/payment-form"
import { updateLoan, deleteLoan, addLoanPayment, deleteLoanPayment } from "@/app/actions/loans"
import { calcLoanSummary, calcNextInterest, calcLoanStatus, type InterestType, type LoanStatus, type PaymentLikelihood } from "@/lib/loan"

function formatRupiah(n: number | string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(Number(n))
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
}

type LoanDetail = {
  id: string; type: string; name: string; description: string | null
  principal_amount: number; interest_rate: number; interest_type: string
  start_date: string; due_date: string | null; wallet_id: string; wallet_name: string; status: string
  payment_likelihood: PaymentLikelihood | null
}

const LIKELIHOOD_LABEL: Record<string, string> = {
  LANCAR: "Bayar", MACET: "Kemungkinan Tidak Bayar",
}
const LIKELIHOOD_VARIANT: Record<string, "default" | "success" | "warning" | "destructive"> = {
  LANCAR: "success", MACET: "destructive",
}
type PaymentRow = { id: string; principal_paid: number; interest_paid: number; total_paid: number; date: string; notes: string | null }

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ONGOING: "default", LUNAS: "success", TERLAMBAT: "destructive",
}

export default async function LoanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ loanId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId  = await requireUserId()
  const { loanId } = await params
  const isActive   = true
  const sp         = await searchParams
  const showNew    = sp.new === "1"
  const isEdit     = sp.edit === "1"

  const loan = await db.prepare<[string, string], LoanDetail>(
    `SELECT l.id, l.type, l.name, l.description,
            l.principal_amount, l.interest_rate, l.interest_type,
            l.start_date, l.due_date, l.status, l.payment_likelihood, l.wallet_id, w.name AS wallet_name
     FROM loans l JOIN wallets w ON w.id = l.wallet_id
     WHERE l.id=? AND l.user_id=? AND l.is_active=1`
  ).get(loanId, userId) as LoanDetail | undefined
  if (!loan) redirect("/pinjaman")

  const payments = await db.prepare<[string], PaymentRow>(
    `SELECT id, principal_paid, interest_paid, total_paid, date, notes
     FROM loan_payments WHERE loan_id=? ORDER BY date DESC, created_at DESC`
  ).all(loanId) as PaymentRow[]

  // calcLoanSummary expects string fields in some versions; adapt:
  const summaryInput = {
    principal_amount: String(loan.principal_amount),
    interest_rate:    String(loan.interest_rate),
    interest_type:    loan.interest_type as InterestType,
    due_date:         loan.due_date,
    status:           loan.status as LoanStatus,
  }
  const paymentsInput = payments.map((p) => ({
    ...p,
    principal_paid: String(p.principal_paid),
    interest_paid:  String(p.interest_paid),
    total_paid:     String(p.total_paid),
  }))

  const summary    = calcLoanSummary(summaryInput, paymentsInput)
  const liveStatus = calcLoanStatus(loan.due_date, summary.remainingPrincipal)
  const nextInterest = calcNextInterest(
    summary.principalAmount,
    loan.interest_rate,
    loan.interest_type as InterestType,
    summary.remainingPrincipal,
  )

  const cancelHref = `/pinjaman/${loanId}`

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 mt-0.5 shrink-0">
            <Link href="/pinjaman"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{loan.name}</h1>
              <Badge variant={loan.type === "PIUTANG" ? "success" : "destructive"} className="text-xs">{loan.type}</Badge>
              <Badge variant={STATUS_VARIANT[liveStatus] ?? "default"} className="text-xs">{liveStatus}</Badge>
              {loan.type === "PIUTANG" && loan.payment_likelihood && (
                <Badge variant={LIKELIHOOD_VARIANT[loan.payment_likelihood] ?? "default"} className="text-xs">{LIKELIHOOD_LABEL[loan.payment_likelihood]}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{loan.wallet_name}</p>
          </div>
        </div>
        {!summary.isLunas && (
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link href={`${cancelHref}?edit=1`}><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Link>
            </Button>
            {payments.length === 0 && (
              <form action={deleteLoan.bind(null, loanId)}>
                <Button type="submit" variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/30">
                  <Trash2 className="h-3.5 w-3.5 mr-1" />Hapus
                </Button>
              </form>
            )}
          </div>
        )}
      </div>

      {isEdit && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Edit Pinjaman</p>
              <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href={cancelHref}><X className="h-4 w-4" /></Link></Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <LoanForm
              wallets={[]}
              action={updateLoan.bind(null, loanId)}
              defaultValues={{
                type: loan.type, name: loan.name, description: loan.description,
                principalAmount: loan.principal_amount, interestRate: loan.interest_rate,
                interestType: loan.interest_type, startDate: loan.start_date,
                dueDate: loan.due_date, walletId: loan.wallet_id,
                paymentLikelihood: loan.payment_likelihood,
              }}
              isEdit cancelHref={cancelHref}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Pokok Pinjaman</p><p className="font-bold tabular-nums">{formatRupiah(loan.principal_amount)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Sisa Pokok</p><p className={`font-bold tabular-nums ${summary.remainingPrincipal > 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatRupiah(summary.remainingPrincipal)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Total Terbayar</p><p className="font-bold text-emerald-600 tabular-nums">{formatRupiah(summary.totalPaid)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Total Bunga</p><p className="font-bold text-amber-600 tabular-nums">{formatRupiah(summary.totalInterestPaid)}</p></CardContent></Card>
      </div>

      {!summary.isLunas && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Progres Pelunasan</span>
              <span>{formatRupiah(summary.totalPrincipalPaid)} / {formatRupiah(summary.principalAmount)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full transition-all ${liveStatus === "TERLAMBAT" ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min(100, (summary.totalPrincipalPaid / summary.principalAmount) * 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Mulai: {formatDate(loan.start_date)}
                {loan.due_date && <> · Jatuh tempo: <span className={liveStatus === "TERLAMBAT" ? "text-destructive font-medium" : ""}>{formatDate(loan.due_date)}</span></>}
              </span>
              {loan.interest_rate > 0 && (
                <span className="text-muted-foreground">Bunga berikutnya: <span className="text-amber-600 font-medium">{formatRupiah(nextInterest)}</span></span>
              )}
            </div>
            {loan.description && <p className="text-xs text-muted-foreground border-t pt-2">{loan.description}</p>}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Riwayat Cicilan</h2>
          {!showNew && !summary.isLunas && (
            <Button asChild size="sm"><Link href={`${cancelHref}?new=1`}><Plus className="h-4 w-4 mr-1" />Tambah Cicilan</Link></Button>
          )}
        </div>

        {showNew && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Tambah Cicilan</p>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7"><Link href={cancelHref}><X className="h-4 w-4" /></Link></Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <PaymentForm
                loanType={loan.type}
                principalAmount={loan.principal_amount}
                interestRate={loan.interest_rate}
                interestType={loan.interest_type}
                remainingPrincipal={summary.remainingPrincipal}
                action={addLoanPayment.bind(null, loanId)}
                cancelHref={cancelHref}
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Belum ada cicilan. <Link href={`${cancelHref}?new=1`} className="text-primary underline underline-offset-2">Tambah cicilan pertama</Link>
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-4 py-3 text-left font-medium">Tanggal</th>
                      <th className="px-4 py-3 text-right font-medium">Pokok Dibayar</th>
                      {loan.interest_rate > 0 && <th className="px-4 py-3 text-right font-medium">Bunga</th>}
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-left font-medium">Catatan</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 tabular-nums text-muted-foreground whitespace-nowrap">{formatDate(p.date)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{formatRupiah(p.principal_paid)}</td>
                        {loan.interest_rate > 0 && <td className="px-4 py-3 text-right tabular-nums text-amber-600">{formatRupiah(p.interest_paid)}</td>}
                        <td className={`px-4 py-3 text-right tabular-nums font-semibold ${loan.type === "PIUTANG" ? "text-emerald-600" : "text-rose-600"}`}>{formatRupiah(p.total_paid)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{p.notes ?? "—"}</td>
                        <td className="px-3 py-3 text-right">
                          <form action={deleteLoanPayment.bind(null, p.id, loanId)}>
                            <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20">
                      <td className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Total</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">{formatRupiah(summary.totalPrincipalPaid)}</td>
                      {loan.interest_rate > 0 && <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-600">{formatRupiah(summary.totalInterestPaid)}</td>}
                      <td className="px-4 py-3 text-right tabular-nums font-bold">{formatRupiah(summary.totalPaid)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
