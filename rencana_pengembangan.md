# Rencana Pengembangan: Aplikasi Manajemen Keuangan Keluarga (Multi-User SaaS)

Status: **Rencana Pelaksanaan (Draft Final - Executable Spec & Plan)**  
Tanggal: 2026-10-29  

---

## 1. Ringkasan Eksekutif & Keputusan Arsitektur

Dokumen ini adalah spesifikasi teknis dan panduan pelaksanaan tingkat lanjut untuk merombak proyek `money-management` dari aplikasi pencatatan *single-user* menjadi **Sistem Manajemen Keuangan Keluarga Multi-Tenant berbasis Lisensi/SaaS** dengan standar keamanan aplikasi keuangan (*finance-grade security*) serta arsitektur kode modular berbasis *Layered Service-Repository Pattern*.

### Tabel Keputusan Utama Arsitektur

| Topik | Keputusan & Spesifikasi Teknik |
| :--- | :--- |
| **Super Admin (Owner)** | Role khusus `super_admin` untuk pengelola SaaS. Berhak membuat keluarga baru, mengelola lisensi/langganan, dan menambah/mengatur anggota keluarga mana pun. |
| **Sistem Lisensi** | Tabel `licenses` terikat ke `households` untuk mengontrol status langganan (*active, expired, trial*), batas anggota (*max_members*), dan tanggal kadaluarsa (*expires_at*). |
| **Identitas & Auth** | Tabel `"user"` menjadi tabel identitas utama (`username`, `password_hash`, `role`, `relation`). Password di-hash dengan **Argon2id** atau **Bcrypt (Cost Factor 12)**. |
| **Keluarga Multi-Tenant** | Entitas `households` dan `household_members` mengisolasi data per keluarga. Siap dikomersialkan untuk banyak keluarga. |
| **Dompet (Wallets)** | **100% Privat per User**. Dompet diikat mutlak ke `user_id`. **Fitur saldo (`balance`) dihapus**. Dompet hanya berfungsi sebagai label/sumber arus kas. |
| **Scope Transaksi & Laporan** | Transaksi **selalu diikat ke `user_id` pembayar**. Flag `is_family_expense` menentukan apakah transaksi dibebankan sebagai pengeluaran personal atau beban rumah tangga. |
| **UX Context Switcher** | **Scope Switcher** di header atas untuk berpindah antara *Mode Laporan Keluarga* (dengan tema/indikator khusus) dan *Mode Personal*. Menghilangkan kebingungan peran Admin/User. |
| **Arsitektur Kode Clean Layer** | **Memisahkan Logika Bisnis & Database (Service-Repository Pattern)**. Logika bisnis diisolasi dari komponen UI/Server Actions untuk mempermudah refactoring/migrasi ke backend terpisah (misal: Go) di masa mendatang. |
| **Kategori** | **Satu daftar bersama untuk seluruh keluarga** (`household_id`), tanpa duplikasi per-user dan per-tahun. |
| **Budgeting** | **Per-orang (`user_id`)**, dihitung berdasarkan persentase pemasukan atau nilai nominal absolut. |
| **Jejak Input & Security** | Kolom `recorded_by` mencatat user pencatat. Proteksi IDOR, Rate Limiting Login, Validasi Zod, dan Cookie `HttpOnly + SameSite=Strict` diterapkan secara mutlak. |

---

## 2. Model Data & Skema Database (Database Migration Plan)

Berikut adalah perintah DDL SQL lengkap yang siap dijalankan pada PostgreSQL.

### 2.1 Skema Tabel Baru

```sql
-- 1. Tabel Utama Keluarga
CREATE TABLE households (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'IDR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabel Lisensi / Langganan Produk (SaaS)
CREATE TABLE licenses (
  id             TEXT PRIMARY KEY,
  household_id   TEXT NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  plan_type      TEXT NOT NULL DEFAULT 'basic', -- 'basic' | 'family_pro' | 'lifetime'
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended', 'trial')),
  max_members    INTEGER NOT NULL DEFAULT 5,
  starts_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ,                  -- NULL = Lifetime / Tanpa Batas
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Keanggotaan Keluarga
CREATE TABLE household_members (
  household_id   TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin','member','child')),
  relation       TEXT,                       -- 'suami' | 'istri' | 'anak'
  spending_limit DOUBLE PRECISION,           -- batas belanja bulanan (khusus role child)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX idx_household_members_user ON household_members (user_id);
CREATE INDEX idx_licenses_household ON licenses (household_id);
```

### 2.2 Perubahan Skema Tabel Existing

```sql
-- A. Tabel "user" & user_sessions
ALTER TABLE "user" ADD COLUMN username      TEXT;
ALTER TABLE "user" ADD COLUMN password_hash TEXT;
ALTER TABLE "user" ADD COLUMN relation      TEXT;   -- 'suami' | 'istri' | 'anak'
ALTER TABLE "user" ADD COLUMN role          TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('super_admin','admin','member','child'));
ALTER TABLE "user" ADD CONSTRAINT user_username_key UNIQUE (username);

-- Migrasi credentials lama ke user utama
UPDATE "user" SET
  username      = (SELECT username      FROM credentials LIMIT 1),
  password_hash = (SELECT password_hash FROM credentials LIMIT 1),
  role          = 'super_admin' -- Memberikan hak Super Admin ke akun default awal
WHERE id = 'local-user';

DROP TABLE credentials;

-- Tambahkan FK user_id ke session
ALTER TABLE user_sessions ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE user_sessions SET user_id = 'local-user';
ALTER TABLE user_sessions ALTER COLUMN user_id SET NOT NULL;

-- B. Tabel wallets (Dompet Murni Privat & Tanpa Balance)
ALTER TABLE wallets ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE wallets SET user_id = 'local-user' WHERE user_id IS NULL;
ALTER TABLE wallets ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE wallets DROP COLUMN IF EXISTS balance;
ALTER TABLE wallets DROP COLUMN IF EXISTS is_shared;

-- C. Tabel expenses (Penanda Pengeluaran Keluarga & Audit Input)
ALTER TABLE expenses ADD COLUMN is_family_expense INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE expenses SET recorded_by = user_id;

-- Penambahan recorded_by ke 7 tabel transaksi lainnya
ALTER TABLE incomes ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE incomes SET recorded_by = user_id;

ALTER TABLE transfers ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE transfers SET recorded_by = user_id;

ALTER TABLE investments ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE investments SET recorded_by = user_id;

ALTER TABLE investment_goals ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE investment_goals SET recorded_by = user_id;

ALTER TABLE loans ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
UPDATE loans SET recorded_by = user_id;

-- D. Kategori Bersama Keluarga (Hapus 'year' & 'user_id' per-user)
ALTER TABLE income_categories ADD COLUMN household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE income_categories DROP COLUMN IF EXISTS user_id;
ALTER TABLE income_categories DROP COLUMN IF EXISTS year;

ALTER TABLE expense_types ADD COLUMN household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expense_types DROP COLUMN IF EXISTS user_id;
ALTER TABLE expense_types DROP COLUMN IF EXISTS year;

ALTER TABLE expense_categories ADD COLUMN household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expense_categories DROP COLUMN IF EXISTS user_id;
ALTER TABLE expense_categories DROP COLUMN IF EXISTS year;
```

---

## 3. Fitur Super Admin (`/super-admin`) & Pengelolaan SaaS

### 3.1 Portal Kelola Lisensi & Pembelian (`app/(protected)/super-admin/page.tsx`)

Halaman khusus ini **hanya dapat diakses jika `session.role === 'super_admin'`**.

```
┌────────────────────────────────────────────────────────────────────────┐
│  ⚙️ SUPER ADMIN DASHBOARD - MANAGEMENT LISENSI & KELUARGA              │
├────────────────────────────────────────────────────────────────────────┤
│  [+ Tambah Keluarga & Pembeli Baru]   [ 🔍 Cari Keluarga / Username ] │
│                                                                        │
│  Daftar Keluarga Terdaftar:                                            │
│  ┌──────────────────┬──────────────┬─────────────┬───────────┬────────┐│
│  │ Nama Keluarga    │ Admin/Kontak │ Status      │ Kuota     │ Aksi   ││
│  ├──────────────────┼──────────────┼─────────────┼───────────┼────────┤│
│  │ Keluarga TONAS   │ tonas_suami  │ 🟢 Active   │ 3/5 User  │ [Edit] ││
│  │ Keluarga Budi    │ budi_admin   │ 🟡 Trial    │ 2/3 User  │ [Edit] ││
│  │ Keluarga Ahmad   │ ahmad_head   │ 🔴 Expired  │ 4/5 User  │ [Edit] ││
│  └──────────────────┴──────────────┴─────────────┴───────────┴────────┘│
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Modal / Form "Tambah Keluarga & Pembeli Baru"

Proses pendaftaran keluarga baru oleh Super Admin mengeksekusi urutan database transaction:
1. Insert baris ke `households`.
2. Insert baris ke `licenses` (`plan_type`, `max_members`, `expires_at`).
3. Insert baris ke `"user"` untuk Kepala Keluarga (`username`, `password_hash`, `role = 'admin'`, `relation = 'suami'`).
4. Insert baris ke `household_members` (`household_id`, `user_id`, `role = 'admin'`).
5. Seed kategori bawaan keluarga dari template global (`household_id IS NULL`).

---

## 4. Logika Bisnis, UX Context Switcher, Keamanan, & Clean Architecture

### 4.1 UX Context Switcher (Header App)

Untuk mencegah kebingungan peran Kepala Keluarga (kapan sebagai individu vs kapan sebagai pengelola keluarga), sistem menyediakan **Scope / Context Switcher** di header:

```
┌────────────────────────────────────────────────────────────────────────┐
│ TONAS  Dashboard  Cashflow  Dompet  Investasi      Context: [ 🏠 Laporan Keluarga ▾ ]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│ Opsi Dropdown Context:                                                 │
│  • 🏠 Laporan Keluarga (Global)  --> Header Aksen Hijau/Biru Tua        │
│  • 👤 Mode Personal: Suami       --> Badge "Mode Pribadi Suami"        │
│  • 👩 Mode Personal: Istri       --> Mode Read-Only (Khusus Admin)     │
│  • 👧 Mode Personal: Anak        --> Mode Read-Only (Khusus Admin)     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Aturan Kerja Context Switcher:**
* **Di Mode Laporan Keluarga:** Tampilan Dashboard & Rekap memfokuskan grafik pada **Stacked Bar Chart** (komposisi pengeluaran Rumah Tangga vs Personal masing-masing anggota).
* **Di Mode Personal:** Tampilan difilter murni untuk `user_id` terkait. Transaksi ber-flag `is_family_expense = 1` diabaikan dari perhitungan anggaran personal.

### 4.2 Standar Keamanan Sistem (Security Architecture)

1. **Password Hashing:** Menggunakan **Argon2id** atau **Bcrypt (Cost Factor 12)** via `lib/auth-simple.ts`.
2. **Session Cookie Security:**
   * `HttpOnly = true`
   * `Secure = true` (In Production)
   * `SameSite = Strict`
   * `Path = /`
3. **Rate Limiting Login:** Maksimal 5 x percobaan gagal per IP/username dalam interval 15 menit.
4. **Pencegahan IDOR (Insecure Direct Object Reference):**
   * Server Actions & Query Repository **DILARANG** menggunakan `household_id` atau `user_id` dari client request body.
   * `household_id` dan `user_id` wajib dibaca murni dari server-side session (`requireSession()`).
5. **Validasi Input:** Seluruh masukan Server Action divalidasi menggunakan skema **Zod**.

### 4.3 Clean Layered Architecture (Service-Repository Pattern)

Seluruh logika aplikasi wajib dibagi secara ketat ke dalam 4 layer terpisah:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. UI Layer / React Components (`app/(protected)/*`)                   │
│    - Hanya mengurus UI rendering, event handler, dan React State.      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Calls
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 2. Controller Layer / Server Actions (`actions/*`)                    │
│    - Auth Checking, Session Guard, & Zod Payload Validation.           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Delegates to
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. Service Layer (`services/*`)                                        │
│    - LOGIKA BISNIS MURNI (Kalkulasi budget, pembagian scope personal   │
│      vs keluarga, kalkulasi %, limit belanja anak).                     │
│    - Dilarang mengandung HTTP/NextResponse. Murni TypeScript Logic!    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Calls
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. Repository / Data Access Layer (`repositories/*` & `lib/db.ts`)    │
│    - Mengurus Prepared SQL Queries ke PostgreSQL database.             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Rencana Eksekusi Langkah demi Langkah (Action Plan untuk AI/Developer)

### Fase 1: Database Migration & Schema Hardening
- [ ] Buat file migrasi SQL `003_family_saas_schema.sql` berdasarkan DDL di Bab 2.
- [ ] Eksekusi migrasi ke PostgreSQL database.
- [ ] Buat skrip data migration untuk backfill `local-user` menjadi `role = 'super_admin'`.
- [ ] Pastikan koneksi database menggunakan TLS (`sslmode=require`).

### Fase 2: Security & Authentication Layer
- [ ] Pasang pustaka bcrypt (`npm install bcrypt @types/bcrypt`).
- [ ] Refactor `lib/auth-simple.ts` untuk mendukung hashing Bcrypt/Argon2id.
- [ ] Konfigurasi cookie sesi di `lib/session.ts` (`HttpOnly`, `SameSite=Strict`).
- [ ] Buat middleware rate limiting pada endpoint `/api/auth/login`.

### Fase 3: Repository & Service Layer Refactoring (Clean Architecture)
- [ ] Buat folder `dtos/`, `repositories/`, dan `services/`.
- [ ] Buat `repositories/expense.repository.ts` untuk mengisolasi query SQL `expenses`.
- [ ] Buat `services/expense.service.ts` untuk menangani kalkulasi pengeluaran personal vs keluarga.
- [ ] Buat `lib/scope.ts` untuk helper resolusi `householdId` dan `userIds` dari session.

### Fase 4: Super Admin Portal (`/super-admin`)
- [ ] Buat `services/license.service.ts` & `repositories/license.repository.ts`.
- [ ] Buat Server Action `actions/super-admin.ts` untuk pendaftaran keluarga + lisensi baru.
- [ ] Buat halaman UI `app/(protected)/super-admin/page.tsx`.

### Fase 5: Context Switcher & Redesain UI Header
- [ ] Buat komponen React `components/context-switcher.tsx`.
- [ ] Integrasikan `ContextSwitcher` ke dalam main header layout `app/(protected)/layout.tsx`.
- [ ] Tambahkan logika perubahan warna/badge indikator mode aktif (Keluarga vs Personal).

### Fase 6: Halaman Dompet Privat & Transaksi Interaktif
- [ ] Refactor `app/(protected)/dompet/page.tsx`: Hapus kalkulasi & komponen visual `balance` (saldo).
- [ ] Perbarui form transaksi pengeluaran: Tambahkan dropdown dompet privat & checkbox `[ ] Catat sebagai Pengeluaran Keluarga` (`is_family_expense`).

### Fase 7: Visualisasi Dashboard & Laporan Agregat
- [ ] Tampilkan **Stacked Bar Chart** komposisi pengeluaran di Dashboard (`app/(protected)/dashboard/page.tsx`).
- [ ] Buat **Report Utama Keluarga** dan **Report Personal** di halaman Rekap (`app/(protected)/rekap/page.tsx`).

### Fase 8: Management Anggota & Mode Anak
- [ ] Buat halaman `/pengaturan/anggota` khusus Admin Keluarga (dengan validasi limit `max_members` dari lisensi).
- [ ] Implementasikan Route Guard untuk role `child` (hanya diizinkan membuka `/dashboard` versi anak dan `/saya`).

---

## 6. Skenario Pengujian System & Verification Checklist

1. **Uji Multi-Tenancy SaaS:**
   - Login Super Admin $\rightarrow$ Tambah "Keluarga A" dan "Keluarga B".
   - Login sebagai Admin Keluarga A $\rightarrow$ Pastikan data transaksi Keluarga B tidak pernah bocor/terbaca.
2. **Uji IDOR Proteksi:**
   - Kirim HTTP request manipulatif dengan mengganti parameter `household_id` ke ID milik keluarga lain.
   - **Ekspektasi:** Server menolak request dengan respon `403 Forbidden` / `404 Not Found`.
3. **Uji Rate Limiting Login:**
   - Coba login dengan password salah 6x berturut-turut.
   - **Ekspektasi:** Request ke-6 diblokir oleh Rate Limiter.
4. **Uji Transaksi Belanja Keluarga (`is_family_expense`):**
   - Suami menginput pengeluaran Rp 500.000 dengan flag `is_family_expense = 1`.
   - **Ekspektasi:** Laporan Personal Suami **tidak berkurang** nominal budget-nya, tetapi Laporan Utama Keluarga bertambah Rp 500.000 pada porsi *Rumah Tangga*.
5. **Uji Lisensi Expired:**
   - Ubah kolom `expires_at` pada tabel `licenses` ke tanggal kemarin.
   - **Ekspektasi:** User dialihkan secara otomatis ke rute `/license-expired`.