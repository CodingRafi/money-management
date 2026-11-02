# Integrasi Telegram + AI (Gemini)

Anggota keluarga bisa mencatat transaksi dari chat Telegram. Pesan (atau foto struk)
dikirim ke bot Telegram → diparse oleh **Gemini** (function calling) → AI memanggil
tool yang menulis ke database aplikasi → bot membalas ringkasannya.

```
Telegram  ──webhook──▶  app/api/telegram/webhook
                            │
                            ├─ verifikasi secret header
                            ├─ chat_id → user_id (tabel telegram_links)
                            ├─ Gemini: pesan + gambar (OCR struk)
                            │     └─ function call → services (expense/finance)
                            └─ balas ke Telegram
```

## 1. Persiapan

### a. Bot Telegram

1. Chat [@BotFather](https://t.me/BotFather) → `/newbot` → simpan **token**.
2. (Opsional) `/setjoingroups` biarkan default; bot dipakai di chat pribadi.
3. Catat username bot (mis. `tonas_bot`) untuk ditampilkan di UI.

### b. Gemini API key

Buat API key di [Google AI Studio](https://aistudio.google.com/apikey). Model
default `gemini-2.5-flash` (mendukung vision/OCR struk). Ganti lewat env
`GEMINI_MODEL` bila perlu model lain.

### c. Environment

Tambahkan ke `.env.local`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 24>
TELEGRAM_BOT_USERNAME=tonas_bot
GEMINI_API_KEY=AIza...
GEMINI_MODEL=gemini-2.5-flash
```

`TELEGRAM_WEBHOOK_SECRET` wajib: Telegram mengirimkannya sebagai header
`X-Telegram-Bot-Api-Secret-Token`, dan webhook menolaknya kalau tidak cocok.
Tanpa ini, siapa pun bisa menyuruh bot mencatat transaksi.

## 2. Database

```bash
npm run migrate
```

Migrasi `007_telegram.sql` membuat tabel `telegram_links` (ikatan chat ↔ akun)
dan `telegram_link_codes` (kode sekali pakai).

## 3. Pasang webhook

Butuh `NEXT_PUBLIC_APP_URL` yang bisa diakses publik (https, bukan localhost —
kecuali pakai ngrok saat dev).

```bash
bun scripts/telegram-setup.ts           # pasang
bun scripts/telegram-setup.ts --remove  # lepas
```

Outputnya memuat URL webhook, username bot, dan antrean update.

### Slash command (tag `/`)

Saat anggota mengetik `/` di chat, Telegram menampilkan daftar perintah
otomatis. Daftar ini dipasang lewat API `setMyCommands` (bukan manual di
BotFather), jadi ikut terpasang bareng webhook:

```bash
npm run telegram:setup                # webhook + slash command
bun scripts/telegram-setup.ts --commands-only   # pasang ulang tag saja
bun scripts/telegram-setup.ts --skip-commands  # webhook saja
```

Perintah yang tersedia:

| Perintah | Fungsi |
|---|---|
| `/start` | Bantuan & cara pakai |
| `/link KODE` | Hubungkan akun dengan kode koneksi |
| `/unlink` | Putuskan hubungan akun |
| `/riwayat` | 10 transaksi terakhir (beserta kode revisi) |
| `/revisi` | Perbaiki transaksi yang salah catat |
| `/status` | Status koneksi akun |
| `/help` | Bantuan |

Untuk menambah/mengubah perintah, edit konstanta `BOT_COMMANDS` di
`scripts/telegram-setup.ts`, lalu jalankan ulang `--commands-only`.

## Format output transaksi

Balasan pencatatan **dibentuk dari data server**, bukan kalimat bebas dari AI.
Jadi formatnya konsisten, lengkap, dan selalu menampilkan ID + kode revisi:

```
Pengeluaran berhasil ditambahkan:
Tanggal : 2026-11-02
Jumlah : Rp 27.000
Nama / Keterangan : Makan siang
Wallet sumber : BCA
Jenis Kebutuhan : PRIMER
Kategori : HIBURAN/JAJAN
Catat sebagai pengeluaran keluarga : N
ID : 730ad12c-df3b-4970-8da8-80cf79592c67
Kode revisi : 592C67
Salah? kirim: /revisi <kode> <field> <nilai>
```

Pendapatan memakai format serupa (tanpa baris "Jenis Kebutuhan" dan
"Catat sebagai pengeluaran keluarga").

## Perintah revisi

Setiap transaksi punya **kode 6 karakter** (6 karakter terakhir ID-nya) supaya
mudah diketik. Kodenya muncul di pesan pencatatan dan di `/riwayat`.

```
/revisi                     → daftar kode terbaru + panduan
/revisi 592C67              → tampilkan data transaksi saat ini
/revisi 592C67 jumlah 30rb  → ubah field
```

Field yang bisa diubah:

| Field | Alias | Contoh |
|---|---|---|
| `jumlah` | nominal, amount, harga | `/revisi 592C67 jumlah 30rb` |
| `nama` | keterangan | `/revisi 592C67 nama makan malam` |
| `tanggal` | date | `/revisi 592C67 tanggal 2026-11-01` |
| `kategori` | category | `/revisi 592C67 kategori TRANSPORTASI` |
| `wallet` | dompet | `/revisi 592C67 wallet BCA` |
| `kebutuhan` | needs | `/revisi 592C67 kebutuhan SEKUNDER` |
| `keluarga` | family | `/revisi 592C67 keluarga Y` |

Nominal ditulis bebas: `30rb`, `1,5jt`, `2jt500`, `50k`, `150000`.
Field yang tidak di-revisi **tidak berubah** — revise tanggal tidak menghapus
kategori, dan sebaliknya.

`kebutuhan` dan `keluarga` hanya berlaku untuk pengeluaran; `revisi` pada
pendapatan dengan field itu akan ditolak.

### Revisi lewat bahasa alami

AI juga bisa memperbaiki transaksi kalau diminta dalam kalimat biasa:

```
"tolong ubah transaksi kode 592C67 jadi 55rb"
"yang tadi 27rb seharusnya 30rb ya"
```

Keduanya memakai tool `revise_expense` / `revise_income` yang sama dengan
perintah `/revisi`, jadi aturannya identik.

### Uji jalur AI tanpa Telegram

Untuk memastikan `GEMINI_API_KEY` dan model sudah benar sebelum webhook dipasang:

```bash
bun scripts/telegram-ai-check.ts "makan siang 25rb"
```

Script menjalankan pesan contoh langsung ke Gemini (function calling) memakai
akun anggota keluarga pertama, lalu menampilkan tool yang dipanggil & balasannya.

## 4. Menautkan akun anggota

Penautkan bersifat **per akun** (satu akun ↔ satu chat Telegram), jadi admin
keluarga dan tiap anggota menautkan akunnya sendiri:

1. Anggota buka aplikasi → menu **Saya → Telegram**.
   Alternatif: klik avatar di kanan atas navbar → **Integrasi Telegram**.
2. Klik **Buat kode koneksi** (kode 6 huruf/angka, berlaku 15 menit, sekali pakai).
3. Anggota membuka bot di Telegram dan mengirim `/link ABC123`.
4. Bot mengonfirmasi, dan dari situ chat tersebut terhubung ke akun anggota itu.

Super Admin tidak bisa menautkan bot (bukan anggota keluarga), dan tidak ada
menu yang menampilkan kode milik anggota lain.

Pemutusan hubungan: `/unlink` di Telegram, atau tombol **Putuskan hubungan**
di halaman **Saya → Telegram**.

## 5. Yang bisa dilakukan lewat chat

| Contoh pesan | Hasil |
|---|---|
| `makan siang 25rb` | Pengeluaran 25.000, kategori Primer |
| `beli bensin 100rb di Pertamina` | Pengeluaran + kategori & dompet dicocokkan |
| `gaji 5jt kategori TETAP` | Pemasukan |
| `transfer 500rb dari bca ke gopay` | Transfer antar dompet |
| `pinjam 2jt ke budi` | Piutang |
| `bayar cicilan 500rb` | Cicilan pinjaman |
| `beli saham BBCA 1 lot 2jt` | Aset + transaksi BUY investasi |
| `berapa pengeluaran bulan ini?` | Ringkasan + sisa budget |
| foto struk | OCR → otomatis jadi pengeluaran |
| `/riwayat` | 10 transaksi terakhir |
| `/status`, `/help`, `/unlink` | Informasi & pengaturan |

Perintah lain yang tersedia: `/start`.

## Catatan keamanan & perilaku

- **Satu chat = satu akun.** `chat_id` unik di DB; akun hanya boleh punya satu chat.
- **Aturan bisnis tetap berlaku.** Penulisan lewat Telegram memakai service layer
  yang sama dengan web (`expenseService`, `financeService`), termasuk batas
  belanja bulanan untuk peran *anak* dan aturan kepemilikan dompet.
- **Hanya akun anggota keluarga** yang bisa memakai bot (super admin tidak).
- **Destructive command tidak otomatis.** Tool `delete_*` hanya dijalankan bila
  pengguna meminta menghapus transaksi tertentu.
- **Rate limit** 20 pesan per 5 menit per chat; update Telegram yang sama
  dideduplikasi (tidak jadi transaksi ganda).
- **Riwayat chat** disimpan di memori server (maks 10 giliran terakhir) dan
  hilang saat restart.
- Biaya API Gemini mengikuti pemakaian; model `gemini-2.5-flash` dipilih agar murah.

## Berkas penting

| Berkas | Isi |
|---|---|
| `app/api/telegram/webhook/route.ts` | Endpoint webhook + verifikasi secret |
| `services/telegram.service.ts` | Orkestrasi: perintah, linking, rate limit, riwayat |
| `lib/telegram/agent.ts` | Loop function calling + system prompt |
| `lib/telegram/tools.ts` | Definisi tool Gemini + eksekutor |
| `lib/telegram/gemini.ts` | Klien Gemini (REST) |
| `lib/telegram/telegram-api.ts` | Klien Telegram Bot API (REST) |
| `repositories/telegram.repository.ts` | Query tabel `telegram_links` & `telegram_link_codes` |
| `services/finance.service.ts` | Service bersama untuk web & Telegram (transfer/pinjaman/investasi) |
