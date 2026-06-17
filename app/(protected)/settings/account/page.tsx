"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { updateCredentials } from "@/app/actions/session"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckCircle, AlertCircle, Download, Upload, FolderOpen } from "lucide-react"

type State = { error?: string; success?: boolean } | null

export default function AccountSettingsPage() {
  const [state, action, pending] = useActionState<State, FormData>(updateCredentials, null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [dbPath, setDbPath] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/db-path")
      .then((r) => r.json())
      .then((d) => { if (d.path) setDbPath(d.path) })
      .catch(() => {})
  }, [])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportMsg(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/import", { method: "POST", body: form })
      const data = await res.json()
      if (data.success) {
        setImportMsg({ type: "ok", text: "Data berhasil diimport. Memuat ulang aplikasi..." })
        setTimeout(() => { window.location.href = "/" }, 1500)
      } else {
        setImportMsg({ type: "err", text: data.error ?? "Import gagal" })
      }
    } catch {
      setImportMsg({ type: "err", text: "Terjadi kesalahan saat upload file." })
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola akun dan data aplikasi</p>
      </div>

      {/* Export / Import */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Export &amp; Import Data</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">Export semua data ke file SQL dump yang bisa diimport ke laptop lain.</p>
            <Button asChild variant="outline" className="w-full gap-2">
              <a href="/api/export" download>
                <Download className="h-4 w-4" />
                Export SQL Dump
              </a>
            </Button>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">Import file SQL dump dari hasil export sebelumnya. Data existing akan ditimpa.</p>
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {importing ? "Mengimport..." : "Import SQL Dump"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".sql,text/plain"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          {importMsg && (
            <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              importMsg.type === "ok"
                ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/5 text-destructive"
            }`}>
              {importMsg.type === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {importMsg.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database location */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Lokasi Database</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-2">
          <p className="text-sm text-muted-foreground">Direktori tempat file database SQLite disimpan.</p>
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <FolderOpen className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="text-sm font-mono break-all">
              {dbPath ?? "Memuat..."}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Change credentials */}
      <Card>
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-base">Ganti Username &amp; Password</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <form action={action} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current_password">Password Saat Ini</Label>
              <Input id="current_password" name="current_password" type="password" placeholder="••••••••" required autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username Baru</Label>
              <Input id="username" name="username" type="text" placeholder="username baru" required autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password Baru</Label>
              <Input id="password" name="password" type="password" placeholder="••••••••" required autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm_password">Konfirmasi Password Baru</Label>
              <Input id="confirm_password" name="confirm_password" type="password" placeholder="••••••••" required autoComplete="new-password" />
            </div>

            {state?.error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {state.error}
              </div>
            )}
            {state?.success && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Kredensial berhasil diperbarui. Gunakan username &amp; password baru untuk login berikutnya.
              </div>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
