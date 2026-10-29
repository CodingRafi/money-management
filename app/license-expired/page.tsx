import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { licenseService } from "@/services/license.service"
import { logout } from "@/app/actions/session"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ShieldAlert } from "lucide-react"

const MESSAGES = {
  expired: "Lisensi keluarga Anda telah berakhir.",
  suspended: "Lisensi keluarga Anda sedang ditangguhkan.",
  missing: "Akun Anda belum terhubung ke lisensi keluarga.",
} as const

export default async function LicenseExpiredPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  // Lisensi sudah aktif lagi (atau super admin) → tidak perlu di halaman ini.
  let reason: keyof typeof MESSAGES = "missing"
  if (session.role === "super_admin") redirect("/dashboard")
  if (session.householdId) {
    const state = await licenseService.getState(session.householdId)
    if (state.ok) redirect("/dashboard")
    reason = state.reason ?? "missing"
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
          <h1 className="text-xl font-bold">Akses Dibatasi</h1>
          <p className="text-sm text-muted-foreground">
            {MESSAGES[reason]} Hubungi pengelola aplikasi untuk memperpanjang lisensi.
          </p>
          <form action={logout}>
            <Button type="submit" variant="outline">Keluar</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
