"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { createTelegramLinkCode, unlinkTelegram } from "@/app/actions/telegram"

interface Props {
  linked: boolean
  linkedChat: string | null
  botUsername: string | null
}

export function TelegramLinkPanel({ linked, linkedChat, botUsername }: Props) {
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const generate = () => {
    startTransition(async () => {
      try {
        const res = await createTelegramLinkCode()
        setCode(res.code)
        setExpiresAt(res.expiresAt)
        setMessage(null)
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Gagal membuat kode")
      }
    })
  }

  const unlink = () => {
    startTransition(async () => {
      try {
        await unlinkTelegram()
        setCode(null)
        setExpiresAt(null)
        setMessage("Hubungan diputus.")
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Gagal memutus hubungan")
      }
    })
  }

  const botRef = botUsername ? `@${botUsername}` : "bot ini"

  return (
    <div className="space-y-4">
      {linked ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">✅ Akun sudah terhubung ke Telegram</p>
          <p className="mt-1 text-emerald-800">
            Chat: <span className="font-mono">{linkedChat}</span>
          </p>
          <p className="mt-2 text-emerald-700">
            Kirim pesan apa saja ke {botRef} — misalnya <em>“makan siang 25rb”</em> — atau kirim foto struk.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={unlink} disabled={isPending}>
            Putuskan hubungan
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Hubungkan akun ini ke Telegram supaya bisa mencatat transaksi dari chat — termasuk kirim foto struk
            yang nominalnya dibaca otomatis oleh AI.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Klik “Buat kode koneksi” di bawah.</li>
            <li>
              Buka Telegram, cari {botRef}, lalu kirim <span className="font-mono">/link KODE</span>.
            </li>
            <li>Kode berlaku 15 menit dan hanya bisa dipakai sekali.</li>
          </ol>
          <Button onClick={generate} disabled={isPending}>
            {isPending ? "Membuat kode…" : "Buat kode koneksi"}
          </Button>

          {code && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">Kode koneksi</p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em]">{code}</p>
              {expiresAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Berlaku sampai {new Date(expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Kirim ke {botRef}: <span className="font-mono">/link {code}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
