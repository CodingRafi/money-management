"use client"

import { useActionState, useState } from "react"
import { generateLicenceAction } from "@/app/actions/admin-licence"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Copy, Check } from "lucide-react"
import Link from "next/link"

export default function GenerateLicencePage() {
  const [state, action, isPending] = useActionState(generateLicenceAction, null)
  const [noExpiry, setNoExpiry]    = useState(false)
  const [copied, setCopied]        = useState(false)

  function copyCode() {
    if (!state?.code) return
    navigator.clipboard.writeText(state.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/licences">
            <ArrowLeft className="h-4 w-4 mr-1" />Kembali
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Generate Lisensi</h1>
          <p className="text-sm text-muted-foreground">Buat kode lisensi baru untuk konsumen</p>
        </div>
      </div>

      {state?.code ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">Lisensi berhasil dibuat!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Salin kode di bawah dan berikan kepada konsumen.
            </p>
            <div className="flex items-center gap-2 rounded-md border bg-muted px-4 py-3">
              <span className="font-mono text-lg font-bold tracking-widest flex-1">{state.code}</span>
              <Button size="sm" variant="outline" onClick={copyCode}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link href="/admin/licences">Lihat Semua Lisensi</Link>
              </Button>
              <Button className="flex-1" onClick={() => window.location.reload()}>
                Generate Lagi
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form action={action} className="space-y-5">
              {/* Harga */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Harga Lisensi</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
                  <Input type="number" name="price" min={0} step={1000} placeholder="0" className="pl-9" />
                </div>
                <p className="text-xs text-muted-foreground">Kosongkan jika gratis / belum ditentukan.</p>
              </div>

              {/* Masa berlaku */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Masa Berlaku</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                  <input
                    type="checkbox" name="noExpiry"
                    checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)}
                    className="rounded"
                  />
                  Seumur hidup (tidak ada expired)
                </label>
                {!noExpiry && <Input type="date" name="expiredAt" required={!noExpiry} />}
              </div>

              {/* Grace period */}
              {!noExpiry && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Grace Period (hari)</label>
                  <Input type="number" name="gracePeriod" defaultValue={3} min={0} />
                  <p className="text-xs text-muted-foreground">
                    Hari akses view-only setelah expired sebelum benar-benar diblokir.
                  </p>
                </div>
              )}

              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? "Membuat lisensi..." : "Generate Kode Lisensi"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
