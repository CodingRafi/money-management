---
description: Lanjutkan fix bug perhitungan budget di tabel report pengeluaran (/rekap/[year]?view=report&detail=pengeluaran) — amplop alokasi tipe. Baca docs/HANDOFF-BUDGET-ENVELOPE.md dulu.
---

Lanjutkan pekerjaan "fix budget kategori dihitung dari amplop alokasi tipe".

**Langkah wajib pertama:** baca `docs/HANDOFF-BUDGET-ENVELOPE.md` — dokumen itu
memuat seluruh konteks, akar masalah, rumus yang sudah diterapkan, dan daftar
pekerjaan yang tersisa. Jangan mulai dari nol.

Isi handoff yang perlu dikerjakan:

1. **§3a — cermin Telegram** (`lib/telegram/budget-status.ts`, PRIORITAS TINGGI).
   Query `SQL` dan `BULK_SQL` masih memakai `max = income × (pct / 100)` tanpa
   amplop tipe. Tambahkan `expense_categories.type_id`, alokasi dari
   `type_allocations` (fallback ke tahun terbaru ≤ tahun berjalan), dan
   `year_budget_settings.max_expense_pct`, lalu ubah rumusnya jadi
   `income × (alokasiTipe% × maxPct%) × pctKategori%`.
   Ingat aturan placeholder `lib/db.ts`: query ditulis gaya SQLite (`?`),
   diterjemahkan ke `$1, $2, ...` **urutan kemunculan** — hitung ulang urutan
   argumen `.all(...)` di bawah file setiap menambah placeholder.

2. **§3b — label input** (`app/(protected)/rekap/[year]/_components/kategori-budget-tab.tsx`,
   input `name="percentage"`). Tambahkan teks bantuan bahwa % itu relatif ke
   alokasi tipe, bukan ke pendapatan global.

3. **§3c — verifikasi**: `npx tsc --noEmit`, `eslint .`, `bun build`, lalu cek
   manual bahwa MAX kategori ≤ MAX baris tipe induknya.

**Jangan** mengerjakan item §3d (semantik penjumlahan persentase antar anggota
di mode Keluarga) — itu isu terpisah yang sengaja di luar scope fix ini.

Perubahan di `app/(protected)/rekap/[year]/page.tsx` sudah masuk di working
tree tapi belum di-commit — pertahankan, jangan dibalik.
