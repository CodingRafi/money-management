import { requireSession } from "@/lib/session"
import { telegramRepository } from "@/repositories/telegram.repository"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { TelegramLinkPanel } from "./_components/telegram-link-panel"

export default async function TelegramSettingsPage() {
  const session = await requireSession()
  const link = await telegramRepository.findByUserId(session.userId)
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") ?? null

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Integrasi Telegram</h1>
        <p className="text-sm text-muted-foreground">
          Catat pengeluaran, pemasukan, pinjaman, dan investasi lewat chat.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Status koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          <TelegramLinkPanel
            linked={!!link}
            linkedChat={link?.telegram_username ? `@${link.telegram_username}` : (link?.chat_id ?? null)}
            botUsername={botUsername}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Contoh perintah</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li><span className="font-mono">makan siang 25rb</span> — catat pengeluaran</li>
            <li><span className="font-mono">gaji 5jt kategori TETAP</span> — catat pemasukan</li>
            <li><span className="font-mono">pinjam 2jt ke budi</span> — catat piutang</li>
            <li><span className="font-mono">berapa pengeluaran bulan ini?</span> — ringkasan</li>
            <li>Kirim <strong>foto struk</strong> — nominal & merchant dibaca otomatis</li>
          </ul>
        </CardContent>
      </Card>

      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard">Kembali ke Dashboard</Link>
      </Button>
    </div>
  )
}
