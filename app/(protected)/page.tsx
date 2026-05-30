import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { Card, CardContent } from "@/components/ui/card"
import { BarChart2, ChevronRight, FolderOpen } from "lucide-react"
import Link from "next/link"

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const firstName = session?.user.name.split(" ")[0] ?? "Pengguna"

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Selamat datang kembali, {firstName}!</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* ── Report Keuangan ── */}
        <div className="opacity-60 cursor-not-allowed">
          <Card className="h-full pointer-events-none">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <BarChart2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold">Report Keuangan</p>
                <p className="mt-1 text-sm text-muted-foreground">Segera hadir</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Manage Keuangan ── */}
        <Link href="/rekap" className="group">
          <Card className="h-full transition-all group-hover:border-primary/50 group-hover:shadow-md cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <FolderOpen className="h-8 w-8" />
              </div>
              <div>
                <p className="text-lg font-semibold">Manage Keuangan</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Kelola rekap keuangan tahunan
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                Buka
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
