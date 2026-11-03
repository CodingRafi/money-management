# Handoff — Bug "Perhitungan Table" di `/rekap/[year]?view=report&detail=pengeluaran`

Status: **dalam pengerjaan** — perbaikan di halaman web sudah masuk, cermin Telegram belum.
Dibuat: 2026-11-02 · Branch: `main` · Commit terakhir saat handoff: `1daae9b`

---

## 1. Bug yang dilaporkan

Di halaman `/rekap/2026?view=report&detail=pengeluaran`, tabel per-kategori punya
dua lapis persentase yang saling bertumpuk:

| Lapis | Sumber | Contoh |
|---|---|---|
| **Alokasi tipe** (`type_allocations`) | "TETAP 60%, FLEKSIBEL 40%" | 60% dari total pengeluaran |
| **Batas pengeluaran** (`year_budget_settings`) | "max pengeluaran" | 100% (default) |
| **Persentase kategori** (`budgets`) | ORANG TUA = 70% | 70% |

Laporan user: setelah TETAP di-set 60% dan ORANG TUA di-set 70%, hasil perhitungan
ORANG TUA **lebih besar** dari baris induk TETAP (60%) — secara logika tidak mungkin,
anak tidak boleh melebihi amplop induknya.

### Akar masalah

Rumus di `app/(protected)/rekap/[year]/page.tsx` (sebelum perbaikan):

```
Baris TIPE     : MAX = income × (alokasiTipe% × maxPct%)     ✅ ikut amplop tipe
Baris KATEGORI : MAX = income × pctKategori%                   ❌ amplop tipe diabaikan
```

Persentase kategori dihitung terhadap **pendapatan global**, bukan terhadap
**amplop tipe**. Akibatnya `70% × income` > `60% × income`.

### Verifikasi numerik (data backup `keluarga-rafi-backup.json`, Juni 2026)

Pendapatan Juni 2026 = Rp5.567.200

```
Sebelum fix:
  TETAP (baris tipe)    MAX = 5.567.200 × 60%      = Rp3.340.320
  ORANG TUA (kategori)  MAX = 5.567.200 × 70%      = Rp3.897.040   ← lebih besar dari induknya
  Realisasi ORANG TUA                             = Rp2.000.000   → sisa +Rp1.897.040 (NORMAL)

Sesudah fix:
  TETAP (baris tipe)    MAX = 5.567.200 × 60%      = Rp3.340.320
  ORANG TUA (kategori)  MAX = 5.567.200 × 60% × 70% = Rp2.338.224  ← ≤ induknya ✓
  Realisasi ORANG TUA                             = Rp2.000.000   → sisa +Rp338.224 (NORMAL)
```

Data relevan di backup (user `user-rafi`):
- `type_allocations` 2026: TETAP = 60, FLEKSIBEL = 40
- `budgets`: kategori `001d5087…` (ORANG TUA) = 70% (Juni 2026), 50% (Juni 2025)
- `expense_categories`: ORANG TUA tipe = TETAP (`93109f67…`)

---

## 2. Perbaikan yang sudah diterapkan

File: `app/(protected)/rekap/[year]/page.tsx` (tabel "Data" di report pengeluaran).

### 2a. Konsep "amplop" (envelope)

```ts
// Amplop budget kategori = alokasi TIPE (dikalikan batas pengeluaran)
// terhadap pendapatan. Persentase kategori dihitung DARI amplop tipe,
// bukan dari pendapatan global.
const envelope        = (typeAlloc > 0 ? (typeAlloc / 100) : 1) * (maxExpensePct / 100)
const repPctOfIncome = envelope * repPct
```

- `typeAlloc > 0` → amplop = alokasi tipe (persentase kategori relatif ke tipe).
- `typeAlloc === 0` → amplop = 1 (tipe tanpa alokasi → kategori relatif ke batas
  pengeluaran global, supaya budget kategori tidak hilang diam-diam).

### 2b. Rumus MAX kategori

```ts
const maxBudget = hasNominal
  ? (cat.nominal ?? 0)                                   // nominal = absolute, menang
  : monthIncome * envelope * (monthPct / 100)             // ← sudah dikalikan amplop
const hasBudget = hasNominal || (envelope > 0 && monthPct > 0)
```

### 2c. Kolom "% / NOMINAL"

Sekarang menampilkan dua baris supaya jelas proporsinya:

```
70.00% TETAP
= 42.0% pendapatan
```

### 2d. Yang TIDAK diubah (sengaja)

- Baris **tipe** (`typeMax`) — rumusnya sudah benar.
- Baris **TOTAL PENGELUARAN** di `<tfoot>` — memakai `maxExpensePct` global, sudah benar.
- **Budget nominal** (`category_nominal_budgets`) — absolute, menang atas persentase;
  tidak perlu amplop.
- `expenseStatus()` — tidak berubah.

---

## 3. Yang BELUM selesai (lanjut di sini)

### [ ] 3a. Cermin Telegram — `lib/telegram/budget-status.ts` (PRIORITAS TINGGI)

Modul ini menghitung MAX / PENGELUARAN / SISA / STATUS yang ** supposedly cermin
dari tabel Rekap** — lihat komentar di header file. Saat ini masih memakai rumus
lama tanpa amplop:

```ts
// lib/telegram/budget-status.ts — SQL (baris ~32) dan BULK_SQL (baris ~170)
const max = hasNominal ? nominal : income * (pct / 100)   // ❌ amplop tipe diabaikan
```

Harus diubah di **kedua** query (`SQL` dan `BULK_SQL`) agar ikut mengambil:

1. `expense_categories.type_id` untuk tiap kategori.
2. Alokasi tipe untuk tahun berjalan dari `type_allocations`, dengan fallback
   ke tahun terbaru ≤ tahun berjalan (pola yang sudah dipakai di
   `app/(protected)/rekap/[year]/page.tsx` baris ~224):
   ```sql
   ta.year = (SELECT MAX(t2.year) FROM type_allocations t2
               WHERE t2.user_id = ANY(?) AND t2.type_id = et.id AND t2.year <= ?)
   ```
   Di mode keluarga, `SUM(ta.percentage)` antar anggota (mengikuti agregasi
   `budgets` yang juga `SUM`).
3. `year_budget_settings.max_expense_pct` untuk tahun berjalan. Halaman Rekap
   memakai `MAX(max_expense_pct)` antar anggota — samakan.

Lalu rumus MAX jadi:

```
MAX = nominal  ATAU  income × (alokasiTipe% × maxPct%) × pctKategori%
```

Ingat aturan placeholder: query ditulis gaya SQLite (`?`), `lib/db.ts` yang
menerjemahkan ke `$1, $2, ...` **urutan kemunculan**. Kalau menambah
placeholder, hitung ulang urutan argumen `.all(...)` di bagian bawah file.

Pemakai `budget-status.ts` yang ikut terpengaruh (tidak perlu diubah, karena
perbaikannya di dalam modul):
- `lib/telegram/reports.ts` → `recapCategory` (perintah `/rekap_kategori`)
- `lib/telegram/reports.ts` → `budgetReport` (perintah `/anggaran`)
- `lib/telegram/revision.ts` → kartu transaksi saat revise
- `lib/telegram/tools.ts` → ringkasan transaksi

### [ ] 3b. Label di halaman Kategori & Budget

`app/(protected)/rekap/[year]/_components/kategori-budget-tab.tsx` — input "%"
per kategori (baris ~373, `name="percentage"`) kini berarti **% dari alokasi
tipe**, bukan % dari pendapatan. Tambahkan teks bantuan kecil di dekat input
supaya tidak membingungkan, misal:

```
Budget (dari TETAP)   [ 70 ] %
```

Perhatikan juga baris ~308 (`= {fromIncome.toFixed(1)}% pendapatan`) untuk alokasi
tipe — sudah benar, tidak diubah.

### [ ] 3c. Verifikasi

```bash
bunx tsc --noEmit     # atau: npx next typegen && npx tsc --noEmit
eslint .
bun build
```

Lalu cek manual di `http://localhost:3000/rekap/2026?view=report&detail=pengeluaran`:
- ORANG TUA (70% di TETAP 60%) → MAX harus **≤** MAX baris TETAP.
- Total baris kategori dalam satu tipe tidak boleh melebihi MAX tipe.
- Kategori tanpa alokasi tipe (alokasi 0) tetap menampilkan MAX.

### [ ] 3d. Catatan penting — masalah terpisah (JANGAN dicampur ke fix ini)

Mode "Keluarga" menjumlahkan **persentase** antar anggota
(`SUM(b.percentage)` di `budgets`, `SUM(ta.percentage)` di `type_allocations`).
Menurut `docs/RANCANGAN-KELUARGA.md` §7.5.A, seharusnya budget keluarga dihitung
dari penjumlahan **nominal per orang** (`Σ income_orang × pct_orang`), bukan dari
penjumlahan persentase. Ini isu semantics yang lebih besar dan **belum** dikerjakan
di sini — Mention terpisah kalau mau tackling.

---

## 4. Konteks teknis yang perlu diketahui

- **Stack**: Next.js 16.2.6 (App Router, Turbopack) · React 19.2.4 · TypeScript ·
  Tailwind v4 · PostgreSQL via `pg`.
- **DB**: hanya PostgreSQL. Semua akses lewat `lib/db.ts`:
  - `db.prepare(sql).all(...)` / `.get(...)` / `.run(...)` mengembalikan **Promise** → wajib `await`.
  - Placeholder gaya SQLite (`?`), otomatis jadi `$1, $2, ...`.
  - Boolean disimpan INTEGER `0/1`.
  - Placeholder **tidak boleh muncul di dalam string literal** `'...'` — `lib/db.ts`
    hanya mengabaikan `?` di luar literal.
- **Migration**: `npm run migrate` (butuh `DATABASE_URL` di `.env.local`).
  `.env.local` lokal: `postgres://postgres:000000@localhost:5432/money_management`.
- **Alias**: `@/*` → root repo (bukan `src/`).
- **Scope**: `lib/scope.ts` — mode `family` (admin, semua anggota) vs `personal`.
  Di mode personal, `is_family_expense` tidak dihitung (`famClause`).
- **Data contoh**: `keluarga-rafi-backup.json` (backup DB, tabel: budgets,
  type_allocations, expense_categories, incomes, expenses, …) dan
  `keluarga-rafi-setup.sql` (seed akun `user-rafi` / household `household-rafi`).
  Tabel `budgets` di backup tidak punya kolom `type_id` — stok lama.
- **Dokumentasi desain**: `docs/RANCANGAN-KELUARGA.md` (semantik budget §7.5),
  `docs/TELEGRAM.md`.

## 5. Git

Perubahan saat handoff ada di working tree (`app/(protected)/rekap/[year]/page.tsx`),
belum di-commit. Before pindah laptop:

```bash
git add -A && git commit -m "fix: budget kategori dihitung dari amplop alokasi tipe"
git push
```

Lalu di laptop baru: `git pull` → buka proyek → baca `docs/HANDOFF-BUDGET-ENVELOPE.md`
ini → lanjut dari §3.

---

## 6. Command untuk melanjutkan

```
/lanjut-fix-budget
```

Command tersebut (`.claude/commands/lanjut-fix-budget.md`) memuat instruksi untuk
membaca dokumen handoff ini dan melanjutkan pekerjaan yang tersisa.
