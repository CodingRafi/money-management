export const dynamic = "force-dynamic"

import { Suspense } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { requireSession } from "@/lib/session"
import { requireScope } from "@/lib/scope"
import { FamilySpendingSection } from "@/components/dashboard/FamilySpendingChart"
import { NetWorthSection, NetWorthSkeleton } from "@/components/dashboard/NetWorthCard"
import { CashflowSection, CashflowSkeleton } from "@/components/dashboard/CashflowCards"
import { WalletSection, WalletSkeleton } from "@/components/dashboard/WalletCard"
import { CategorySection, CategorySkeleton } from "@/components/dashboard/CategorySection"

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
  const scope     = await requireScope()
  const userId    = scope.userIds
  const familyMode = scope.mode === "family"
  const username  = (await requireSession()).username
  const firstName = username

  const sp  = await searchParams
  const now = new Date()

  const rawMonth     = typeof sp.month     === "string" ? parseInt(sp.month)     : NaN
  const rawYear      = typeof sp.year      === "string" ? parseInt(sp.year)      : NaN
  const rawChartYear = typeof sp.chartYear === "string" ? parseInt(sp.chartYear) : NaN
  const month     = isNaN(rawMonth)     || rawMonth < 1    || rawMonth > 12   ? now.getMonth() + 1  : rawMonth
  const year      = isNaN(rawYear)      || rawYear < 2000  || rawYear > 2100  ? now.getFullYear()   : rawYear
  const chartYear = isNaN(rawChartYear) || rawChartYear < 2000 || rawChartYear > 2100 ? now.getFullYear() : rawChartYear

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear()

  return (
    <div className="space-y-5">
      {/* Greeting — tanpa filter */}
      <div>
        <h1 className="text-2xl font-bold">{getGreeting()}, {firstName}!</h1>
        <p className="text-sm text-muted-foreground">
          {familyMode ? "Laporan keuangan keluarga (gabungan seluruh anggota)" : scope.readOnly ? "Ringkasan keuangan anggota (read-only)" : "Ringkasan keuangan kamu"}
        </p>
      </div>

      {/* Wealth section — chartYear mengontrol Cashflow Bulanan */}
      <Suspense fallback={<NetWorthSkeleton />}>
        <NetWorthSection userId={userId} year={chartYear} />
      </Suspense>

      {/* ── Dompet — tidak ikut filter bulan ── */}
      {!familyMode && (
        <Suspense fallback={<WalletSkeleton />}>
          <WalletSection userId={scope.targetUserId} />
        </Suspense>
      )}

      {/* ── Cashflow — pakai filter bulan ── */}
      <div className="space-y-4">
        <div className="sticky top-14 z-10 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cashflow
          </p>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
              <Link href={prevMonthHref(month, year)} scroll={false}><ChevronLeft className="h-3.5 w-3.5" /></Link>
            </Button>
            <span className="min-w-[110px] text-center text-sm font-medium">
              {MONTHS[month - 1]} {year}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled={isCurrentMonth} asChild={!isCurrentMonth}>
              {isCurrentMonth ? (
                <span><ChevronRight className="h-3.5 w-3.5" /></span>
              ) : (
                <Link href={nextMonthHref(month, year)} scroll={false}><ChevronRight className="h-3.5 w-3.5" /></Link>
              )}
            </Button>
          </div>
        </div>

        <Suspense fallback={<CashflowSkeleton />}>
          <CashflowSection userId={userId} month={month} year={year} excludeFamily={!familyMode} />
        </Suspense>

        {familyMode && (
          <Suspense fallback={null}>
            <FamilySpendingSection members={scope.members} year={year} month={month} />
          </Suspense>
        )}

        <Suspense fallback={<CategorySkeleton />}>
          <CategorySection userId={userId} month={month} year={year} excludeFamily={!familyMode} />
        </Suspense>

      </div>
    </div>
  )
}
