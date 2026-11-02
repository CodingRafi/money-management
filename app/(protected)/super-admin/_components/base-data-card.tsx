"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle, Download, Upload } from "lucide-react"

export function BaseDataCard() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/admin/base-data/import", { method: "POST", body: form })
      const data = await res.json()
      if (data.success) {
        setMsg({ ok: true, text: `Berhasil: ${data.upserted} baris diproses, ${data.skipped} dilewati.` })
      } else {
        setMsg({ ok: false, text: data.error ?? "Import gagal" })
      }
    } catch {
      setMsg({ ok: false, text: "Terjadi kesalahan saat upload file." })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Base Data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Data referensi global: kategori dompet, kategori investasi, dan template kategori
          pemasukan/pengeluaran. Import bersifat tambah/perbarui per id — tidak ada data yang dihapus
          dan data keluarga tidak tersentuh.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <a href="/api/admin/base-data/export" download>
              <Download className="h-4 w-4" /> Export Base Data
            </a>
          </Button>
          <Button variant="outline" className="gap-2" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {busy ? "Mengimport..." : "Import Base Data"}
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
        </div>
        {msg && (
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              msg.ok
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/5 text-destructive"
            }`}
          >
            {msg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
