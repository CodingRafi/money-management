export const dynamic = "force-dynamic"

import { Suspense } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getUsername } from "@/lib/auth-simple"
import { LOCAL_USER_ID } from "@/lib/auth-simple"
import { NetWorthSection, NetWorthSkeleton } from "@/components/dashboard/NetWorthCard"
import { CashflowSection, CashflowSkeleton } from "@/components/dashboard/CashflowCards"
import { BudgetSection, BudgetSkeleton } from "@/components/dashboard/BudgetCard"
import { WalletSection, WalletSkeleton } from "@/components/dashboard/WalletCard"
import { InvestmentSection, InvestmentSkeleton } from "@/components/dashboard/InvestmentCard"
import { LoanSection, LoanSkeleton } from "@/components/dashboard/LoanCard"
import { RecentTransactionsSection, RecentTransactionsSkeleton } from "@/components/dashboard/RecentTransactions"

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Selamat pagi"
  if (hour < 18) return "Selamat siang"
  return "Selamat malam"
}

function prevMonthHref(month: number, year: number) {
  return month === 1 ? `?month=12&year=${year - 1}` : `?month=${month - 1}&year=${year}`
}

function nextMonthHref(month: number, year: number) {
  return month === 12 ? `?month=1&year=${year + 1}` : `?month=${month + 1}&year=${year}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const userId    = LOCAL_USER_ID
  const username  = getUsername()
  const firstName = username

  const sp  = await searchParams
  const now = new Date()

  const rawMonth = typeof sp.month === "string" ? parseInt(sp.month) : NaN
  const rawYear  = typeof sp.year  === "string" ? parseInt(sp.year)  : NaN
  const month = isNaN(rawMonth) || rawMonth < 1 || rawMonth > 12 ? now.getMonth() + 1 : rawMonth
  const year  = isNaN(rawYear)  || rawYear < 2000 || rawYear > 2100 ? now.getFullYear()  : rawYear

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  return (
    <div className="space-y-5">
      {/* Greeting — tanpa filter */}
      <div>
        <h1 className="text-2xl font-bold">{getGreeting()}, {firstName}!</h1>
        <p className="text-sm text-muted-foreground">Ringkasan keuangan kamu</p>
      </div>

      {/* Wealth section — selalu data terkini, tidak ikut filter bulan */}
      <Suspense fallback={<NetWorthSkeleton />}>
        <NetWorthSection userId={userId} year={now.getFullYear()} />
      </Suspense>

      {/* ── Cashflow & Budget — pakai filter bulan ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cashflow &amp; Budget
          </p>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <Link href={prevMonthHref(month, year)}><ChevronLeft className="h-3.5 w-3.5" /></Link>
            </Button>
            <span className="min-w-[110px] text-center text-sm font-medium">
              {MONTHS[month - 1]} {year}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isCurrentMonth} asChild={!isCurrentMonth}>
              {isCurrentMonth ? (
                <span><ChevronRight className="h-3.5 w-3.5" /></span>
              ) : (
                <Link href={nextMonthHref(month, year)}><ChevronRight className="h-3.5 w-3.5" /></Link>
              )}
            </Button>
          </div>
        </div>

        <Suspense fallback={<CashflowSkeleton />}>
          <CashflowSection userId={userId} month={month} year={year} />
        </Suspense>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Suspense fallback={<BudgetSkeleton />}>
            <BudgetSection userId={userId} month={month} year={year} />
          </Suspense>
          <Suspense fallback={<WalletSkeleton />}>
            <WalletSection userId={userId} />
          </Suspense>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Suspense fallback={<InvestmentSkeleton />}>
          <InvestmentSection userId={userId} />
        </Suspense>
        <Suspense fallback={<LoanSkeleton />}>
          <LoanSection userId={userId} />
        </Suspense>
      </div>

      <Suspense fallback={<RecentTransactionsSkeleton />}>
        <RecentTransactionsSection userId={userId} />
      </Suspense>
    </div>
  )
}
