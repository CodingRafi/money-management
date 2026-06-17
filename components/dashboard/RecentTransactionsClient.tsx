"use client"

import { useState, useTransition } from "react"
import type { ElementType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import {
  ArrowDown, ArrowUp, ArrowLeftRight, TrendingUp, TrendingDown,
  HandCoins, ChevronRight, Wallet,
} from "lucide-react"
import type { RecentCashflowTx, RecentInvestmentTx, RecentLoanTx } from "@/lib/dashboard"
import {
  fetchRecentCashflow,
  fetchRecentInvestment,
  fetchRecentLoan,
} from "@/app/actions/dashboard-recent"

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short" })
}

const RANGE_OPTIONS = [
  { value: 7,   label: "7 hari" },
  { value: 30,  label: "30 hari" },
  { value: 90,  label: "3 bulan" },
  { value: 180, label: "6 bulan" },
]

function RangeSelect({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(Number(e.target.value))}
      className="h-6 rounded border border-input bg-background px-1.5 py-0 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    >
      {RANGE_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground py-2">{label}</p>
}

// ── Cashflow section ─────────────────────────────────────────────────────────

const CASHFLOW_CFG: Record<RecentCashflowTx["type"], { icon: ElementType; iconBg: string; iconColor: string }> = {
  INCOME:   { icon: ArrowDown,      iconBg: "bg-primary/10",     iconColor: "text-primary" },
  EXPENSE:  { icon: ArrowUp,        iconBg: "bg-destructive/10", iconColor: "text-destructive" },
  TRANSFER: { icon: ArrowLeftRight, iconBg: "bg-muted",          iconColor: "text-muted-foreground" },
}

function CashflowList({ data, pending }: { data: RecentCashflowTx[]; pending: boolean }) {
  if (data.length === 0) return <EmptyState label="Belum ada transaksi cashflow" />
  return (
    <ul className={`divide-y divide-border transition-opacity ${pending ? "opacity-40" : ""}`}>
      {data.map(t => {
        const cfg = CASHFLOW_CFG[t.type]
        return (
          <li key={t.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.iconBg}`}>
              <cfg.icon className={`h-3.5 w-3.5 ${cfg.iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{t.label}</p>
              <p className="text-[11px] text-muted-foreground truncate">{fmtDate(t.dateStr)} · {t.sublabel}</p>
            </div>
            <p className={`text-xs font-semibold tabular-nums shrink-0 ${
              t.type === "TRANSFER" ? "text-foreground" : t.isCredit ? "text-primary" : "text-destructive"
            }`}>
              {t.type !== "TRANSFER" && (t.isCredit ? "+" : "-")}{formatRp(t.amount)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

// ── Investment section ───────────────────────────────────────────────────────

function InvestmentList({ data, pending }: { data: RecentInvestmentTx[]; pending: boolean }) {
  if (data.length === 0) return <EmptyState label="Belum ada transaksi investasi" />
  return (
    <ul className={`divide-y divide-border transition-opacity ${pending ? "opacity-40" : ""}`}>
      {data.map(t => {
        const isBuy = t.txType === "BUY"
        return (
          <li key={t.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isBuy ? "bg-primary/10" : "bg-orange-100 dark:bg-orange-900/20"}`}>
              {isBuy
                ? <TrendingUp className="h-3.5 w-3.5 text-primary" />
                : <TrendingDown className="h-3.5 w-3.5 text-orange-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{t.investmentName}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {fmtDate(t.dateStr)} · {isBuy ? "Beli" : "Jual"}{t.goalName ? ` · ${t.goalName}` : ""}
              </p>
            </div>
            <p className={`text-xs font-semibold tabular-nums shrink-0 ${isBuy ? "text-destructive" : "text-primary"}`}>
              {isBuy ? "-" : "+"}{formatRp(t.amount)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

// ── Loan section ─────────────────────────────────────────────────────────────

function LoanList({ data, pending }: { data: RecentLoanTx[]; pending: boolean }) {
  if (data.length === 0) return <EmptyState label="Belum ada pembayaran pinjaman" />
  return (
    <ul className={`divide-y divide-border transition-opacity ${pending ? "opacity-40" : ""}`}>
      {data.map(t => {
        const isPiutang = t.loanType === "PIUTANG"
        return (
          <li key={t.id} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isPiutang ? "bg-primary/10" : "bg-destructive/10"}`}>
              {isPiutang
                ? <HandCoins className="h-3.5 w-3.5 text-primary" />
                : <Wallet className="h-3.5 w-3.5 text-destructive" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{t.loanName}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {fmtDate(t.dateStr)} · {isPiutang ? "Piutang" : "Hutang"}{t.notes ? ` · ${t.notes}` : ""}
              </p>
            </div>
            <p className={`text-xs font-semibold tabular-nums shrink-0 ${isPiutang ? "text-primary" : "text-destructive"}`}>
              {isPiutang ? "+" : "-"}{formatRp(t.totalPaid)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export function RecentTransactionsClient({
  initialCashflow,
  initialInvestment,
  initialLoan,
}: {
  initialCashflow: RecentCashflowTx[]
  initialInvestment: RecentInvestmentTx[]
  initialLoan: RecentLoanTx[]
}) {
  const [cashflowDays, setCashflowDays] = useState(30)
  const [cashflowData, setCashflowData] = useState(initialCashflow)
  const [cashflowPending, startCashflowTx] = useTransition()

  const [investDays, setInvestDays] = useState(30)
  const [investData, setInvestData] = useState(initialInvestment)
  const [investPending, startInvestTx] = useTransition()

  const [loanDays, setLoanDays] = useState(30)
  const [loanData, setLoanData] = useState(initialLoan)
  const [loanPending, startLoanTx] = useTransition()

  function handleCashflowRange(days: number) {
    setCashflowDays(days)
    startCashflowTx(async () => {
      const data = await fetchRecentCashflow(days)
      setCashflowData(data)
    })
  }

  function handleInvestRange(days: number) {
    setInvestDays(days)
    startInvestTx(async () => {
      const data = await fetchRecentInvestment(days)
      setInvestData(data)
    })
  }

  function handleLoanRange(days: number) {
    setLoanDays(days)
    startLoanTx(async () => {
      const data = await fetchRecentLoan(days)
      setLoanData(data)
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Cashflow */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Cashflow Terakhir</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              <RangeSelect value={cashflowDays} onChange={handleCashflowRange} disabled={cashflowPending} />
              <Link href="/rekap/cashflow" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Semua <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CashflowList data={cashflowData} pending={cashflowPending} />
        </CardContent>
      </Card>

      {/* Investasi */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Investasi Terakhir</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              <RangeSelect value={investDays} onChange={handleInvestRange} disabled={investPending} />
              <Link href="/investasi/transaksi" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Semua <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <InvestmentList data={investData} pending={investPending} />
        </CardContent>
      </Card>

      {/* Pinjaman */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Pinjaman Terakhir</CardTitle>
            <div className="flex items-center gap-2 shrink-0">
              <RangeSelect value={loanDays} onChange={handleLoanRange} disabled={loanPending} />
              <Link href="/pinjaman/pembayaran" className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                Semua <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <LoanList data={loanData} pending={loanPending} />
        </CardContent>
      </Card>
    </div>
  )
}
