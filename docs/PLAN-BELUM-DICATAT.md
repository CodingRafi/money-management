# Plan Fitur #2 — Deteksi "Belum Dicatat" (Transaksi Berulang)

Status: **rencana (belum ada perubahan kode)**
Tanggal: 2026-11-04 · Branch target: `main`

---

## 1. Masalah yang diselesaikan

Saat ini pengguna mencatat transaksi **manual** setiap periode. Akibatnya:

1. Usersairepeat — daftar belanja, tagihan listrik, cicilan KPR, iuran sekolah dicatat ulang tiap bulan.
2. Data **tidak lengkap** → rekap `/rekap/[year]` dan budget envelope menyimpang karena transaksi bulan ini belum masuk.
3. Tidak ada cara KNOW user "bulan ini masih ada yang lupa dicatat" — laporan salah baca sebagai "pengeluaran turun".

**Target:** sistem otomatis menemukan pola transaksi berulang dari histori, proposes ke user ("Listrik bulan lalu 450rb tanggal 5 — bulan ini belum ada"), lalu(user mengonfirmasi → terjadwal) sehingga bulan berikutnya benar-benar terisi.

**Beda dari fitur recurring-transaction (rencana lain):** fitur ini **tidak** membuat tagihan otomatis. Ia hanya *deteksi historis → usulkan*, lalu(user yang memutuskan. Jadwal otomatis adalah fase lanjutan (opsional, lihat §8).

---

## 2. Kriteria Terima (Definition of Done)

- [ ] Sistem mendeteksi ≥ 3 pola berulang dari data seed/minimal 6 bulan.
- [ ]_false positive_ rate ≤ 20% pada review manual 20 transaksi teratas.
- [ ] Pengguna bisa: menyetujui / mengabaikan / mengedit satu pola.
- [ ] Pola yang disetujui otomatis membuat transaksi bulan berikutnya (idempotent, tidak dobel).
- [ ] Card "Perlu dicatat" muncul di Dashboard dan di `/rekap/[year]`.
- [ ] Notifikasi via Telegram (`/belum` atau push opsional).
- [ ] Semua operasi respect `scope` (mode keluarga vs personal) dan permission `cashflow.view/create`.

---

## 3. Model Data

Migrasi baru: `migrations/010_recurring_patterns.sql`

```sql
-- Pola transaksi berulang yang sudah dikonfirmasi user.
CREATE TABLE IF NOT EXISTS recurring_patterns (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  household_id   TEXT REFERENCES households(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('EXPENSE','INCOME')),
  name           TEXT NOT NULL,
  category_id    TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  wallet_id      TEXT REFERENCES wallets(id) ON DELETE SET NULL,
  -- Statistik historis (dipakai untukYmenghasilkan nominal & tanggal)
  amount_avg     DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_min     DOUBLE PRECISION NOT NULL DEFAULT 0,
  amount_max     DOUBLE PRECISION NOT NULL DEFAULT 0,
  occurrences    INTEGER NOT NULL DEFAULT 0,
  day_of_month   INTEGER NOT NULL DEFAULT 1,   -- 1..31 (tanggal jatuh tempo)
  confidence     DOUBLE PRECISION NOT NULL DEFAULT 0,
  -- State
  is_active      INTEGER NOT NULL DEFAULT 1,   -- 0 = diabaikan/dimatte
  auto_post      INTEGER NOT NULL DEFAULT 0,   -- 1 = buat transaksi otomatis
  last_posted_month TEXT,                      -- 'YYYY-MM' (idempotensi)
  last_seen_date TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user   ON recurring_patterns (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_house  ON recurring_patterns (household_id);
```

> **Kenapa tidak menambah kolom ke `expenses`?** Pola adalah entitas berbeda dari transaksi (bisa eksis tanpa transaksi). `expenses` tetap tabel transaksi tunggal; `recurring_patterns` = template.

---

## 4. Algoritma Deteksi

Module baru: `lib/recurring/detect.ts` (pure function, tanpa I/O → mudah diuji).

### 4.1 Input

Transaksi 6–12 bulan terakhir (kinds: EXPENSE + INCOME), scope-adjusted:

```ts
export type TxnLike = {
  id: string
  kind: "EXPENSE" | "INCOME"
  name: string
  amount: number
  date: string          // YYYY-MM-DD
  categoryId: string | null
  walletId: string | null
}
```

### 4.2 Pipeline

1. **Normalisasi nama** — lowercase, hapus angka akhir (`listrik 450rb` → `listrik`), hapus kata umum (`tagihan`, `bayar`, `trx`), tokenize.
2. **Grouping** — key = `kind + categoryId + token-nama`. Transaksi dengan nama tak mirip (jarak token > 0.6) tidak digabung.
3. **Clustering per key** — untuk tiap key, cluster nominal dengan toleransi 15% (single-linkage, chain: |a−b| ≤ 15% × max(a,b)).
4. **Skoring tiap cluster** → `confidence` 0..1:

| Sinyal | Bobot | Aturan |
|---|---|---|
| Jumlah kemunculan | 0.35 | `min(occurrences / 3, 1)` — ≥3 kali = penuh |
| Sebaran bulan | 0.25 | `distinctMonths / expectedMonths` (bulanan) |
| Stabilitas nominal | 0.20 | CV ≤ 5% → 1.0; CV ≤ 15% → 0.6; selain itu 0 |
| Stabilitas tanggal | 0.15 | stddev `day_of_month` ≤ 2 → 1.0; ≤ 5 → 0.5; selain 0 |
| Kebersihan kategori | 0.05 | kategori konsisten (≥80% tx satu kategori) |

5. **Filter** — `confidence ≥ 0.55`, `occurrences ≥ 2`, rentang bulan ≥ 2.
6. **Exclude** — transaksi yang sudah ter-cover `investment_transactions` (DCA) & `loan_payments` (cicilan) agar tidak dobel dengan modul lain.

### 4.3 Output

```ts
export type DetectedPattern = {
  key: string
  kind: "EXPENSE" | "INCOME"
  name: string
  categoryId: string | null
  walletId: string | null
  amountAvg: number
  amountMin: number
  amountMax: number
  occurrences: number
  dayOfMonth: number
  confidence: number
  sampleDates: string[]
}
```

### 4.4 Test cases (wajib)

| Skenario | Ekspektasi |
|---|---|
| Listrik 450rb tanggal 5, 6 bulan berturut | 1 pola, confidence ≥ 0.85, day_of_month = 5 |
| Listrik 380rb tgl 5, 460rb tgl 6, 450rb tgl 5 (3 bulan) | 1 pola (cluster 380 & 450 toleransi 15%? 380 vs 450 = 18% → pisah) → 2 pola |
| Belanja random tokoku 20–80rb, 12× sebulan | 0 pola (confidence rendah) |
| Gaji 12jt tanggal 25, 12 bulan | pola INCOME, confidence ≥ 0.9 |
| 2 transaksi identik 2 bulan | 1 pola, confidence sedang (occurrences rendah → ~0.5) → default tidak ditampilkan, bisa "lihat semua" |

---

## 5. Layer Architecture (mengikuti pola repo)

```
repositories/recurring.repository.ts   ← query DB (raw SQL, placeholder `?`)
services/recurring.service.ts           ← aturan bisnis, orkestrasi repository
lib/recurring/detect.ts                 ← algoritma deteksi (pure)
lib/recurring/score.ts                  ← Confidence & util tanggal/bulan
app/actions/recurring.ts                ← Server Actions (zod validation + requireWritableUserId)
app/(protected)/pengaturan/pola/…       ← UI konfirmasi pola
app/(protected)/dashboard/…             ← card "Perlu dicatat"
lib/telegram/tools.ts                   ← tool `list_recurring`, `list_missing_entries`
```

### 5.1 Repository

```ts
export const recurringRepository = {
  async list(userIds: string[]): Promise<PatternRow[]>,
  async findById(id: string): Promise<PatternRow | undefined>,
  async upsert(p: PatternInput): Promise<string>,
  async setState(id: string, patch: { isActive?: number; autoPost?: number }): Promise<void>,
  async markPosted(id: string, month: string): Promise<void>,
}
```

### 5.2 Service

```ts
export const recurringService = {
  /** Deteksi pola dari histori (belum disimpan). */
  async detect(userIds: string[], opts?: { months?: number; minConfidence?: number }): Promise<DetectedPattern[]>,

  /** Simpan pola hasil deteksi (dari review user). */
  async confirm(userId: string, pattern: DetectedPattern & { autoPost?: boolean }): Promise<string>,

  /** Pola aktif yang jatuh tempo pada bulan ini tapi belum ada transaksinya. */
  async missingThisMonth(userIds: string[], month: string): Promise<MissingEntry[]>,

  /** Generate transaksi untuk pola auto_post — idempotent per (pattern, bulan). */
  async postDue(userIds: string[], month: string): Promise<{ created: number; skipped: number }>,
}
```

### 5.3 Server Actions (`app/actions/recurring.ts`)

- `listDetectedPatterns()` → read, butuh `cashflow.view`
- `confirmPattern(input)` → tulis, butuh `cashflow.create`, `requireWritableUserId()`
- `ignorePattern(id)` → tulis
- `updatePattern(id, patch)` → tulis
- `postDuePatterns()` → tulis (dipanggil lazy dari dashboard/rekap, atau cron)

Semua input divalidasi dengan **zod** (repo sudah memakai zod v4 di `lib/telegram/tools.ts`).

---

## 6. UI

### 6.1 Halaman Konfirmasi Pola — `/pengaturan/pola`

Server Component + tabel. Kolom: nama, kategori, rata-rata nominal, tanggal jatuh tempo, jumlah kemunculan, confidence (badge warna), tombol **Setujui** / **Abaikan** / **Edit**.

- Scope switcher mengikuti `requireScope()` — admin dalam mode keluarga melihat pola gabungan, mode personal = miliknya.
- Tab: "Ditemukan" (kandidat belum disimpan) dan "Tersimpan" (pola aktif).

### 6.2 Card Dashboard — "Perlu Dicatat"

- Maksimal 5 item, sorted by (severity: overdue > due-soon, lalu confidence desc).
- Copy: *"Listrik — biasanya tanggal 5 (Rp450.000). Bulan ini belum tercatat."*
- Tombol: **Catat sekarang** (buka form transaksi ter-prefill) dan **Tandai sudah**.

### 6.3 Integrasi `/rekap/[year]`

Tab baru/panel di halaman rekap: "Transaksi Berulang & Yang Belum Dicatat" — tabel master + status.

### 6.4 Telegram

Tool baru di `lib/telegram/tools.ts`:

```
list_missing_entries   → daftar yang belum dicatat bulan ini
list_recurring        → pola tersimpan
confirm_recurring     → setujui pola dari chat (opsional, default nonaktif)
```

Format pakai `lib/telegram/cards.ts` agar konsisten dengan kartu yang sudah ada (`txnCard`, `historyCard`).

---

## 7. Auto-generate transaksi (fase lanjutan, opsional)

Sifat: **lengkap**, bukan boros. Transaksi auto = `is_initial = 0`, `recorded_by` = user pemilik pola, `notes` = "auto dari pola: <nama>".

Trigger (pilih salah satu):
1. **Lazy** — saat user membuka Dashboard/rekap bulan ini, jalankan `postDue()` (idempotent via `last_posted_month`). Tidak butuh cron.
2. **Cron** — `app/api/cron/recurring-post/route.ts`, dipanggil harian (pola cron `app/api/cron/licence-check/route.ts` sudah ada sebagai referensi).

Idempotensi: `last_posted_month`UDE mặc định 'YYYY-MM'; skip bila sudah ada.

> Rekomendasi: mulai dengan **review manual** (tanpa auto-post). Auto-post berisiko mengacaukan rekap kalau deteksi salah. Aktifkan per-pola lewat toggle.

---

## 8. Lockdown & Risiko

| Risiko | Mitigasi |
|---|---|
| False positive → user kewalahan | confidence ≥ 0.55 + review wajib sebelum tersimpan |
| Dobel dengan modul lain (DSA/cicilan) | exclude `investment_transactions` & `loan_payments` di deteksi |
| Bocor data antar keluarga | `scope.userIds` dipakai di semua query; `household_id` dari session, bukan dari input |
| Idempotensi bentrok saat 2 device | `last_posted_month` + unique index parsial pada (id, last_posted_month) bila perlu |
| Performa deteksi di data besar | agregasi di SQL (group by bulan + kategori) sebelum clustering di JS |

---

## 9. Breakdown Task

| # | Task | File | Est |
|---|---|---|---|
| 1 | Migrasi tabel | `migrations/010_recurring_patterns.sql` | 0.5h |
| 2 | Algoritma deteksi + scorer | `lib/recurring/detect.ts`, `lib/recurring/score.ts` | 4h |
| 3 | Unit test algoritma | `lib/recurring/detect.test.ts` (bun test) | 2h |
| 4 | Repository + service | `repositories/recurring.repository.ts`, `services/recurring.service.ts` | 3h |
| 5 | Server Actions (zod) | `app/actions/recurring.ts` | 1.5h |
| 6 | Halaman `/pengaturan/pola` | `app/(protected)/pengaturan/pola/page.tsx` + `_components` | 4h |
| 7 | Card Dashboard "Perlu Dicatat" | `components/dashboard/MissingEntriesCard.tsx` | 2h |
| 8 | Integrasi `/rekap/[year]` | panel pola | 1.5h |
| 9 | Tool Telegram | `lib/telegram/tools.ts`, `lib/telegram/cards.ts` | 2h |
| 10 | Auto-post (lazy) | service + pemanggilan | 1.5h |
| 11 | Smoke test | `scripts/smoke.ts` | 1h |
| | **Total** | | **~23h** |

---

## 10. Verifikasi

```bash
bun test lib/recurring/          # algoritma deteksi
bun scripts/smoke.ts             # jalur tulis recurring + scope
bun dev                          # cek manual: /pengaturan/pola, /dashboard, /rekap/2026
```

Checklist manual:
1. Seed ≥ 6 bulan transaksi dengan pola listrik/gaji → `/pengaturan/pola` menampilkan kandidat.
2. Setujui pola listrik dengan auto-post → reload → transaksi muncul, tidak dobel setelah reload kedua.
3. Ganti scope personal/keluarga → pola mengikuti scope, tidak bocor antar user.
4. Input manual transaksi yang sama → tidak muncul lagi sebagai kandidat (sudah ada di bulan berjalan).
