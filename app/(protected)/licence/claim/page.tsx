"use client"

import { useActionState } from "react"
import { claimLicence } from "@/app/actions/licence"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { KeyRound, CheckCircle } from "lucide-react"

export default function ClaimLicencePage() {
  const [state, action, isPending] = useActionState(claimLicence, null)

  if (state?.success) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Lisensi berhasil diklaim!</h2>
            <p className="text-sm text-muted-foreground">
              Kamu sekarang memiliki akses penuh ke aplikasi.
            </p>
            <Button asChild className="mt-2">
              <a href="/">Ke Dashboard</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-12 space-y-4">
      <div className="text-center space-y-2">
        <KeyRound className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-2xl font-bold">Klaim Lisensi</h1>
        <p className="text-sm text-muted-foreground">
          Masukkan kode lisensi yang kamu terima dari admin untuk mengaktifkan akses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kode Lisensi</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <Input
              name="code"
              placeholder="LIC-XXXX-XXXX-XXXX"
              className="font-mono text-center tracking-widest uppercase"
              autoComplete="off"
            />

            {state?.error && (
              <p className="text-sm text-destructive text-center">{state.error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Memverifikasi..." : "Klaim Lisensi"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
