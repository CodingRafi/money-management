# Rancangan: Mode Keluarga (Multi-User)

Status: **ancangan — belum ada perubahan kode**
Tanggal: 2026-10-29

---

## 1. Ringkasan keputusan

| Topik | Keputusan |
|---|---|
| Identitas | `user` menjadi tabel identitas sungguhan (ada `username` + `password_hash`) |
| Admin | Suami — role `admin`, satu keluarga |
| Anggota | Istri + anak — role `member` / `child`, login username+password yang dibuat admin |
| Kategori | **Satu daftar untuk seluruh keluarga** (rumah tangga), bukan per user |
| Budget | **Per orang** — tiap anggota punya jatah % sendiri |
| Report | **Keluarga per kategori** (agregat semua anggota) |
| Uang | `user_id` = untuk siapa (target budget); `wallets.is_shared` = keluarga atau pribadi |
| Jejak input | Kolom baru `recorded_by` = siapa yang mengetik |

Prinsip yang dipakai: **satu sumber data, dibedakan saat baca.** Tidak ada tabel
"transaksi keluarga" terpisah — kalau dipisah, akan ada dua sumber kebenaran dan
laporan yang tidak pernah balance.

---

## 2. Temuan audit (yang membentuk rancangan ini)

Ditemukan saat membaca kode:

1. **Auth masih single-user.**
   `credentials` = 1 baris, tanpa `user_id`. `user_sessions` juga tanpa `user_id`,
   sehingga `validateSession()` selalu balikin `LOCAL_USER_ID` hardcode
   (`lib/auth-simple.ts:35`). Ini akar masalah "istri bisa login juga".

2. **`user` table praktis kosong.**
   Hanya berisi `('local-user','TONAS','local@tonas.app')`.

3. **Tabel budget sudah punya `user_id` — tidak perlu diubah.**
   `budgets`, `type_allocations`, `year_budget_settings`, `category_nominal_budgets`
   semuanya sudah ber-scope per user. Permintaan "budget per orang" cocok dengan
   schema yang ada.

4. **Kategori meledak per user per tahun.**
   `ensureYearlyCategories()` menyalin kategori tiap user tiap tahun. Saat ini ada
   **90 baris `expense_categories` untuk hanya 18 kategori unik** — tiap kategori
   dicopy per tahun, dan bahkan ada duplikat dalam tahun yang sama (hasil seed +
   hasil `ensureYearlyCategories` bentrok). Dengan 3 anggota keluarga, ini akan
   jadi 3 set kategori dan admin hanya lihat kategorinya sendiri.

5. **`bestYearCTE` ada semata-mata untuk tenuous tahun kategori.**
   `app/(protected)/rekap/[year]/page.tsx:91`. Kalau kategori jadi stabil, logika
   ini hilang — dan laporan lintas tahun jadi benar-benar mudah.

6. **Tidak ada `recorded_by`.** `user_id` di `expenses` = pemilik uang, tidak bisa
   menjawab "siapa yang input".

7. **23 file hardcode `LOCAL_USER_ID`.** `requireUserId()` sudah tersedia di
   `lib/session.ts` tapi hampir tidak dipakai — migrasi Mostly mekanis.

8. **`recorded_by` di 9 tabel uang:** `incomes`, `expenses`, `transfers`,
   `investments`, `investment_transactions`, `investment_goals`, `loans`,
   `loan_payments`, `wallet_categories` (tidak perlu — global).

---

## 3. Model data

### 3.1 Tabel baru

```sql
-- Satu keluarga
CREATE TABLE households (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  currency   TEXT NOT NULL DEFAULT 'IDR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keanggotaan keluarga
CREATE TABLE household_members (
  household_id   TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role           TEXT NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin','member','child')),
  relation       TEXT,                       -- 'suami' | 'istri' | 'anak'
  spending_limit DOUBLE PRECISION,           -- batas belanja (untuk anak)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX idx_household_members_user ON household_members (user_id);
```

`role` dipakai untuk hak akses UI, bukan untuk hak akses data. Hak akses data
selalu lewat `household_members`.

### 3.2 Tabel yang diubah

**`"user"` — jadi tabel identitas**

```sql
ALTER TABLE "user" ADD COLUMN username     TEXT;
ALTER TABLE "user" ADD COLUMN password_hash TEXT;
ALTER TABLE "user" ADD COLUMN relation      TEXT;   -- 'suami' | 'istri' | 'anak'
ALTER TABLE "user" ADD COLUMN role          TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin','member','child'));
ALTER TABLE "user" ADD CONSTRAINT user_username_key UNIQUE (username);
-- backfill
UPDATE "user" SET
  username     = (SELECT username     FROM credentials LIMIT 1),
  password_hash= (SELECT password_hash FROM credentials LIMIT 1)
WHERE id = 'local-user';
DROP TABLE credentials;
```

**`user_sessions` — jadi punya pemilik**

```sql
ALTER TABLE user_sessions ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
UPDATE user_sessions SET user_id = 'local-user';
ALTER TABLE user_sessions ALTER COLUMN user_id SET NOT NULL;
```

**Kategori — dari per-user-per-tahun menjadi per-keluarga, tanpa tahun**

```sql
-- income_categories
ALTER TABLE income_categories ADD COLUMN household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE income_categories DROP COLUMN user_id;
ALTER TABLE income_categories DROP COLUMN year;

-- expense_types
ALTER TABLE expense_types ADD COLUMN household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expense_types DROP COLUMN user_id;
ALTER TABLE expense_types DROP COLUMN year;

-- expense_categories
ALTER TABLE expense_categories ADD COLUMN household_id TEXT REFERENCES households(id) ON DELETE CASCADE;
ALTER TABLE expense_categories DROP COLUMN user_id;
ALTER TABLE expense_categories DROP COLUMN year;
```

`household_id` nullable: `NULL` = baris template/default global (dari `002_seed.sql`),
bukan `NULL` = milik keluarga tertentu. Paralel dengan semantik `user_id IS NULL`
yang sekarang.

Menghapus `year` inilah yang menghapus kebutuhan `bestYearCTE` dan
`ensureYearlyCategories`. **Konsekuensi yang disengaja:** kategori tidak bisa
berbeda antar tahun lagi. Ini yang membuat report lintas tahun jadi sederhana,
dan sesuai permintaan "kategori satu keluarga agar report mudah".

**Tabel uang — tambah `recorded_by`**

Untuk 8 tabel: `incomes`, `expenses`, `transfers`, `investments`,
`investment_transactions`, `investment_goals`, `loans`, `loan_payments`.

```sql
ALTER TABLE expenses ADD COLUMN recorded_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
-- backfill
UPDATE expenses SET recorded_by = user_id;
```

`recorded_by` nullable, `ON DELETE SET NULL` — supaya menghapus anggota tidak
menghapus riwayat transaksinya.

**`wallets` — penanda keluarga vs pribadi**

```sql
ALTER TABLE wallets ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 1;
```

Default `1` (keluarga), karena mayoritas dompet keluarga memang dipakai bareng.
Admin bisa menandai dompet pribadi lewat toggle di halaman Dompet.

### 3.3 Tabel yang TIDAK berubah

- **`budgets`, `type_allocations`, `year_budget_settings`,
  `category_nominal_budgets`** — sudah per-user. Nol perubahan.
- **`wallet_categories`, `investment_categories`** — global, dipakai semua.
- **`fundamental_analyses`** — tetap per-user (analisis saham = urusan pribadi).

### 3.4 Bagan relasi

```
households ──< household_members >── "user"
                                          │
   ┌──────────────────────────────────────┴──────────────────────────┐
   │                       (transaksi milik ANGGOTA)                 │
   │  incomes / expenses / transfers / investments / loans           │
   │      user_id       = untuk siapa (sasaran budget)                │
   │      recorded_by   = siapa yang mengetik                          │
   │      wallet_id ────> wallets (is_shared = keluarga/pribadi)     │
   └──────────────────────────────────────────────────────────────────┘

   Kategori: income_categories / expense_types / expense_categories
     household_id → households      (BUKAN per user, BUKAN per tahun)

   Budget: budgets / type_allocations / year_budget_settings /
           category_nominal_budgets
     user_id → "user"   (per orang)  +  category_id → kategori keluarga
```

---

## 4. Migrasi data existing

Ada ~500 baris data. Tiga tantangan nyata:

### 4.1 Dedup kategori (90 → 18)

Kategori harus direpoint ke satu baris kanonik per `(name, type_id)`, **sebelum**
baris lama dihapus (FK `budgets.category_id` = `ON DELETE CASCADE`).

```sql
-- 1) repoint semua referensi ke baris kanonik
WITH canon AS (
  SELECT DISTINCT ON (name, type_id) id AS keep_id, id AS old_id
  FROM expense_categories
  ORDER BY name, type_id, year DESC NULLS LAST
)
UPDATE expenses e SET category_id = c.keep_id
FROM canon c WHERE e.category_id = c.old_id AND c.keep_id <> c.old_id;

-- ulangi untuk: incomes, budgets, category_nominal_budgets, type_allocations
-- (type_allocations & budgets lewat type_id → expense_types, jadi ikut)

-- 2) hapus duplikat (SET NULL / CASCADE sudah aman setelah repoint)
DELETE FROM expense_categories a
USING expense_categories b
WHERE a.id <> b.id
  AND a.name = b.name AND a.type_id = b.type_id
  AND (a.year IS NULL OR b.year IS NULL OR a.year < b.year);
```

Pola sama untuk `income_categories` (12 → 4) dan `expense_types` (8 → 2).

### 4.2 Backfill household

```sql
INSERT INTO households (id, name) VALUES ('hh-tonas', 'Keluarga TONAS');
INSERT INTO household_members (household_id, user_id, role, relation)
VALUES ('hh-tonas', 'local-user', 'admin', 'suami');

UPDATE income_categories  SET household_id = 'hh-tonas' WHERE user_id IS NOT NULL;
UPDATE expense_types      SET household_id = 'hh-tonas' WHERE user_id IS NOT NULL;
UPDATE expense_categories SET household_id = 'hh-tonas' WHERE user_id IS NOT NULL;
```

Baris template (`user_id IS NULL`, `is_default = 1`) tetap `household_id IS NULL`
dan dipakai sebagai sumber saat keluarga baru dibuat.

### 4.3 Backfill `recorded_by` & `is_shared`

```sql
UPDATE incomes                   SET recorded_by = user_id;
UPDATE expenses                  SET recorded_by = user_id;
UPDATE transfers                 SET recorded_by = user_id;
UPDATE investments               SET recorded_by = user_id;
UPDATE investment_transactions   SET recorded_by = (SELECT i.user_id FROM investments i WHERE i.id = investment_transactions.investment_id);
UPDATE loans                     SET recorded_by = user_id;
UPDATE loan_payments             SET recorded_by = (SELECT l.user_id FROM loans l WHERE l.id = loan_payments.loan_id);
UPDATE investment_goals          SET recorded_by = user_id;
```

Semua `recorded_by` diisi `user_id` awal → history tampak seolah-olah semua
ditulis admin. Ini jujur: memang belum ada jejak siapa yang mengetik saat data
lama dibuat.

`wallets.is_shared` default `1`. Admin bisa menandai yang pribadi setelah deploy.

### 4.4 Budget existing

Tabel budget tidak diubah → data lama (`user_id='local-user'`) otomatis jadi
budget Suami. Tidak perlu migrasi.

---

## 5. Auth

### 5.1 `lib/auth-simple.ts` — fungsi yang berubah

| Fungsi | Signature baru |
|---|---|
| `verifyPassword` | `(username, password) → Promise<boolean>` — lookup user by username |
| `createSession` | `(userId) → Promise<string>` — insert `user_id` |
| `validateSession` | `(token) → Promise<Session \| null>` |
| `changeCredentials` | `(userId, user, pass) → Promise<void>` — hanya ubah user sendiri |
| `getUsername` | **dihapus** — nama user kini datang dari session |
| `createUser` | **baru**: `(username, password, name, role) → Promise<string>` |
| `setUserPassword` | **baru**: `(userId, password) → Promise<void>` |

Tipe session baru:

```ts
export type Session = {
  userId: string
  username: string
  name: string
  role: "admin" | "member" | "child"
  householdId: string
}
```

`validateSession` sekarang JOIN `user_sessions` → `"user"` → `household_members`.
Ini satu-satunya tempat yang perlu tahu mapping user→keluarga.

### 5.2 `lib/session.ts`

```ts
export async function getSession(): Promise<Session | null>
export async function requireUserId(): Promise<string>          // sudah ada, tinggal dipakai
export async function requireUserIdAction(): Promise<string>    // sudah ada
export async function requireSession(): Promise<Session>         // baru — butuh role
export async function requireAdmin(): Promise<Session>           // baru — guard untuk manage anggota
```

### 5.3 Ganti 23 file hardcode `LOCAL_USER_ID`

Pola seragam:

```ts
// SEBELUM
const userId = LOCAL_USER_ID

// SESUDAH
const userId = await requireUserId()
```

File yang perlu disentuh (dari grep):
`dashboard/page.tsx`, `dompet/page.tsx`, `investasi/page.tsx`,
`investasi/rekap/page.tsx`, `investasi/transaksi/page.tsx`,
`investasi/aset/[id]/page.tsx`, `investasi/kantong/[goalId]/page.tsx`,
`investasi/fundamental/page.tsx` + 4 sub-halaman, `pinjaman/page.tsx`,
`pinjaman/[loanId]/page.tsx`, `pinjaman/pembayaran/page.tsx`,
`rekap/page.tsx`, `rekap/[year]/page.tsx`, `rekap/[year]/kategori-budget/page.tsx`,
`rekap/cashflow/page.tsx`, `actions/dashboard-recent.ts`.

Halaman yang butuh scope (lihat §6) dapat bonus: `dashboard`, `rekap/*`,
`investasi/*`, `pinjaman/*`.

---

## 6. Scope: individu vs keluarga

### 6.1 Helper baru `lib/scope.ts`

```ts
export type Scope =
  | { kind: "household"; userIds: string[]; label: string }
  | { kind: "user";     userIds: string[]; label: string }

export async function resolveScope(
  currentUserId: string,
  scopeParam?: string,   // "household" | "user:<id>"
): Promise<Scope>
```

- Default: `household` untuk admin, `user` sendiri untuk member/child.
- Admin boleh lihatMilik anggota lain; member hanya boleh lihat dirinya.

### 6.2 Aturan query

Semua query yang sekarang `WHERE x.user_id = ?` berubah jadi:

```sql
WHERE x.user_id = ANY(?)     -- array user_ids dari scope
```

Di adapter `lib/db.ts`, `ANY(?)` tidak bisa menerima array lewat placeholder biasa.
Solusi: pakai `= ANY(string_to_array(?, ','))` dengan id di-join comma, atau
tambah helper `db.prepare` yang menerima array. **Rancangan: tambahkan
`lib/db.ts` helper `arrayParam(userIds)` yang mengembalikan
`{toPostgres: () => '{id1,id2}'}`** — format array literal Postgres, aman karena
id di-generate UUID dan tidak mengandung kutip.

---

## 7. Tampilan

### 7.1 Scope switcher di header

```
┌───────────────────────────────────────────────────────────────────────┐
│ TONAS  Dashboard  Cashflow  Dompet  Investasi  Pinjaman      👤 Suami ▾│
├───────────────────────────────────────────────────────────────────────┤
│  Lihat: [ 👨‍👩‍👧 Keluarga ▾ ]   Periode: [ Okt 2026 ▾ ]                 │
│         ↳ Keluarga · Suami · Istri · Anak                             │
└───────────────────────────────────────────────────────────────────────┘
```

Satu dropdown, bukan tab terpisah. "Keluarga" = agregat, "Suami"/"Istri" =
filter. Tidak ada duplikasi tampilan.

Untuk member/child: switcher disembunyikan (mereka tidak punya akses ke data
orang lain). Bukan disabled — **tidak dirender**, supaya tidak muncul opsi
yang tak bisa dipakai.

### 7.2 Dashboard

```
┌───────────────────────────────────────────────────────────────────────┐
│  Total Keluarga          Rp 149.557.985    ▲ 4,2% vs Sept            │
│  ┌────────────┬────────────┬────────────┬────────────┐               │
│  │ Suami      │ Istri      │ Anak       │ Dompet      │               │
│  │ 82,4 jt    │ 41,2 jt    │ 1,8 jt     │ 24,1 jt    │               │
│  │ 12 transaksi│ 8 transaksi│ 3 transaksi│            │               │
│  └────────────┴────────────┴────────────┴────────────┘               │
└───────────────────────────────────────────────────────────────────────┘
```

Kartu per anggota. Angka per anggota dihitung dari transaksi dengan
`user_id = anggota` (untuk siapa), bukan dari `recorded_by` (siapa yang input).

### 7.3 Tabel pengeluaran (Q2)

Grouping + badge "input oleh" + kolom "sumber dana":

```
│ Tanggal │ Nama            │ Kategori  │ Sumber Dana    │ Input oleh │ Jumlah   │
│─────────│─────────────────│───────────│─────────────────│────────────│──────────│
│ ▼ Suami — 12 transaksi · Rp 82.400.000                               │
│  12/10  │ Bensin motor    │ Transport │ 🏦 BCA Pribadi │ Suami      │  50.000  │
│  11/10  │ Baju            │ Konsumsi  │ 💰 Kas Keluarga │ Istri      │ 175.000  │
│ ▼ Istri — 8 transaksi · Rp 41.200.000                                │
│  10/10  │ Belanja bulanan│ Konsumsi  │ 💰 Kas Keluarga │ Istri      │ 450.000  │
│ ▼ Anak — 3 transaksi · Rp 1.800.000                                 │
│  09/10  │ Es krim        │ Konsumsi  │ 🎒 Uang Saku    │ Anak       │  15.000  │
└───────────────────────────────────────────────────────────────────────┘
```

Tiga aturan yang bikin rapi:

1. **Group header per owner** + subtotal di header → sekilas terlihat siapa boros.
2. **Kolom "Input oleh"** — tampilkan badge avatar **hanya kalau
   `recorded_by != user_id`**. Kalau sama, sembunyikan. Ini menjaga tabel tetap
   bersih tanpa kehilangan informasi.
3. **Kolom "Sumber Dana"** dengan ikon dompet + badge `Keluarga`/`Pribadi`.
   Ini yang memisahkan "keluarga" vs "pribadi" secara visual.

Toggle group-by: `per orang | per kategori | per dompet`. Dimension yang sama,
cuma urutan display.

### 7.4 Form input — "+ Tambah Sebagai"

Saat admin mencatat transaksi, ada pemilih **"Untuk siapa"**:

```
Untuk siapa: [ Suami ▾ ]   Sumber dana: [ 💰 Kas Keluarga ▾ ]
```

`user_id` = hasil pilihan ini. `recorded_by` = user yang sedang login.

Penting: tanpa ini, `user_id` selalu = yang login, dan "pengeluaran tiap orang"
jadi tidak berguna. Admin bisa mencatat pengeluaran istri dari kas keluarga.

Untuk member/child, "Untuk siapa" terkunci ke dirinya sendiri (tidak dirender).

### 7.5 Report — dua jenis: per Orang dan per Keluarga

Ada **dua report** yang terpisah, masing-masing dengan basis perhitungannya
sendiri. Keduanya dihitung dari tabel yang sama, tidak ada data duplikat.

#### A. Semantik budget (penting — ini yang sering salah)

`budgets.percentage` **relatif terhadap pemasukan orang itu sendiri**, bukan
relatif terhadap pemasukan keluarga. Implementasi yang ada sekarang
(`app/(protected)/rekap/[year]/page.tsx:578`):

```
budget_nominal = pemasukan_bulan_ini_orang_tsb × (percentage / 100)
```

Kalau `category_nominal_budgets.nominal` diisi, nilai itu yang dipakai
(absolute, menang atas percentage).

Konsekuensi untuk report keluarga — **budget kategori keluarga bukan jumlah
persentase**, tapi jumlah nominal per orang:

```
budget_kategori_keluarga = Σ_anggota ( pemasukan_anggota_bln_ini × pct_anggota_kategori )
```

Contoh: Suami pemasukan 10jt, pct RUMAH 17,8% → 1,78jt. Istri pemasukan 5jt,
pct RUMAH 20% → 1jt. **Budget keluarga untuk RUMAH = 2,78jt** — bukan
(17,8 + 20)% × 15jt = 5,67jt. Kalau dijumlahkan persentasenya, hasilnya
salah ~2× dan reportnya tidak akan pernah reconcile.

#### B. Report per Orang

Untuk satu anggota terpilih:

- **Realisasi** = `SUM(expenses.amount)` dengan `user_id = orang`
- **Pemasukan** = `SUM(incomes.amount)` dengan `user_id = orang` (basis budget)
- **Budget** = dari `budgets` + `category_nominal_budgets` milik orang tsb

```
┌───────────────────────────────────────────────────────────────────────┐
│  Report Bulanan — Suami            Bulan: [ Okt 2026 ▾ ]            │
│                                                                       │
│  Pemasukan  Rp 10.000.000   Pengeluaran Rp 8.200.000   Sisa +1,8jt  │
│                                                                       │
│  ┌────────────┬──────────────┬──────────────┬────────┬──────────┐   │
│  │ Kategori   │ Realisasi   │ Budget       │ Sisa   │ %        │   │
│  ├────────────┼──────────────┼──────────────┼────────┼──────────┤   │
│  │ RUMAH      │ 1.900.000   │ 1.780.000    │ -120rb │ 107%  ⚠ │   │
│  │ TRANSPORT  │  450.000    │  527.000     │ +77rb  │  85%     │   │
│  │ Konsumsi   │ 2.100.000   │ 2.000.000    │ +100rb │ 105%  ⚠ │   │
│  └────────────┴──────────────┴──────────────┴────────┴──────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

Budget per orang **tidak boleh dijumlahkan ke orang lain** — tiap orang punya
kepentingan berbeda, itu justru alasan kenapa budget disimpan per orang.

#### C. Report per Keluarga

Agregat semua anggota, **dengan budget yang dijumlahkan secara nominal**
(§7.5.A), bukan dijumlahkan persentasenya.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Report Bulanan — Keluarga         Bulan: [ Okt 2026 ▾ ]            │
│                                                                       │
│  Pemasukan  Rp 15.000.000   Pengeluaran Rp 11.400.000  Sisa +3,6jt  │
│                                                                       │
│  ┌────────────┬──────────────┬──────────────┬────────┬──────────┐   │
│  │ Kategori   │ Realisasi   │ Budget       │ Sisa   │ %        │   │
│  ├────────────┼──────────────┼──────────────┼────────┼──────────┤   │
│  │ RUMAH      │ 2.640.000   │ 2.780.000    │ +140rb │  95%     │   │
│  │ TRANSPORT  │  610.000    │  802.000     │ +192rb │  76%     │   │
│  │ Konsumsi   │ 3.100.000   │ 3.150.000    │ +50rb  │  98%     │   │
│  └────────────┴──────────────┴──────────────┴────────┴──────────┘   │
│                                                                       │
│  Rincian per anggota:                                                 │
│  ┌────────────┬──────────────┬──────────────┬──────────────────────┐ │
│  │ Kategori   │ Suami        │ Istri        │ Anak                 │ │
│  ├────────────┼──────────────┼──────────────┼──────────────────────┤ │
│  │ RUMAH      │ 1.900.000    │ 740.000      │ —                    │ │
│  │ TRANSPORT  │  450.000    │ 160.000      │ —                    │ │
│  │ Konsumsi   │ 2.100.000    │ 850.000      │ 150.000              │ │
│  └────────────┴──────────────┴──────────────┴──────────────────────┘ │
└───────────────────────────────────────────────────────────────────────┘
```

Tabel "Rincian per anggota" di bawah report keluarga adalah **tabel
rekonsiliasi**: jumlah kolom harus sama dengan baris Realisasi di atas. Ini
memungkinkan admin instantly melihat "selisih Rp 50rb ada di kategori Konsumsi
— oh, itu child's ice cream yang saya catat dua kali" atau "Budget keluarga
melebihi karena分別 pct Suami 17,8% vs Istri 20%".

#### D. Sifat penting: Report Keluarga = Σ Report per Orang

Karena budget dihitung per orang lalu dijumlahkan secara nominal, dan realisasi
adalah agregat baris yang sama, maka:

> **Report Keluarga = jumlah Report seluruh anggota.**

Ini bukan kebetulan — ini sifat yang benar dan bisa dipakai sebagai uji
konsistensi. Kalau dua report itu tidak cocok, ada bug di query agregasi.
Sifat ini juga yang membuat "budget per orang" tidak merusak laporan keluarga.

#### E. Query

Report per orang (parameter `p_user_ids` = array, `p_user_id` = satu orang):

```sql
-- Realisasi per kategori
SELECT COALESCE(ec.name, 'Lainnya')              AS name,
       COALESCE(SUM(e.amount), 0)                AS total
FROM expenses e
LEFT JOIN expense_categories ec ON ec.id = e.category_id
WHERE e.user_id = ANY($1) AND e.month = $2 AND e.year = $3
GROUP BY ec.name
ORDER BY total DESC;

-- Budget nominal per kategori, dijumlahkan per orang
SELECT b.category_id,
       SUM( COALESCE(nb.nominal, inc.total_income * b.percentage / 100.0) ) AS budget
FROM budgets b
LEFT JOIN category_nominal_budgets nb
       ON nb.category_id = b.category_id AND nb.user_id = b.user_id AND nb.year = b.year
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(i.amount), 0) AS total_income
  FROM incomes i
  WHERE i.user_id = b.user_id AND i.month = b.month AND i.year = b.year
) inc ON TRUE
WHERE b.user_id = ANY($1) AND b.month = $2 AND b.year = $3
GROUP BY b.category_id;
```

Report per orang memakai `WHERE b.user_id = $1` (satu orang) — query-nya sama,
tinggal parameter berbeda. Ini alasan kenapa `resolveScope()` mengembalikan
array `userIds`: **satu query, dua report**, tidak ada duplikasi kode.

#### F. Navigasi

```
Report: [ 👨‍👩‍👧 Keluarga ] [ 👤 Per Orang ▾ ]
                              ↳ Suami · Istri · Anak
```

- Tab "Keluarga" → report C.
- Tab "Per Orang" → pilih anggota → report B.
- Angka di report per orang **tidak** dijumlahkan ke report keluarga (untuk
  menghindari kesalahpaham). Report keluarga selalu dihitung dari semua baris.
- Report per orang menampilkan badge kecil "Saldo non-shared tidak dihitung" —
  biar jelas itu bukan angka seluruh keluarga.

### 7.6 Halaman Kategori & Budget

Karena kategori sekarang bersama, halamannya berubah dari dua hal jadi satu:

- **Kategori** — satu daftar keluarga. Tambah/ubah/hide berlaku untuk semua.
  Tidak ada pilihan tahun lagi (kategori stabil lintas tahun).
- **Budget** — per orang. Tambah dropdown "Anggota: [Suami ▾]" di atas
  tabel. Setiap anggota punya % sendiri per kategori per bulan.

Tampilan budget:

```
Anggota: [ Suami ▾ ]   Bulan: [ Okt ▾ ]   Tahun: [ 2026 ▾ ]

TETAP (alokasi 50%)
  TRANSPORTASI    5,27%   ███░░░░░░░
  RUMAH          17,80%   ████████░░
  ...
FLEKSIBEL (alokasi 30%)
  ...
```

Kolom tambahan: **Realisasi** (angka aktual anggota tsb) dan **Sisa** — supaya
bisa langsung lihat budgetnya terpakai berapa.

### 7.7 Mode anak

Anak login dengan username+password yang dibuat admin (sesuai keputusan).
Halaman anak **berbeda** dan sengaja sangat sederhana:

```
┌─────────────────────────────┐
│  Halo, Rana 👋              │
│  ┌───────────────────────┐  │
│  │  Uang Saku           │  │
│  │  Rp 375.000          │  │
│  │  dari target 500.000 │  │
│  └───────────────────────┘  │
│                             │
│  [+ Catat Pengeluaran]      │
│  ┌───────────────────────┐  │
│  │ Riwayat (7)           │  │
│  │ Es krim    15.000     │  │
│  │ Buku       65.000     │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

Perbedaan dengan orang dewasa:

| Aspek | Admin/Member | Child |
|---|---|---|
| Menu | Semua | Hanya "Beranda" + "Riwayat" |
| Route | Semua | `/dashboard` (versi anak) + `/saya` |
| Data | Sesuai scope | Hanya `user_id = dirinya` |
| Form | Lengkap | Hanya: nominal, keterangan, kategori sederhana |
| Kontrol orang tua | — | `spending_limit` per bulan |

Route guard di `app/(protected)/layout.tsx`:

```ts
const session = await getSession()
if (!session) redirect("/login")
if (session.role === "child") {
  // hanya izinkan /dashboard dan /saya
}
```

Anak **tidak** bisa lihat saldo orang tua, dan tidak bisa akses `/investasi`,
`/pinjaman`, `/rekap`, `/settings`.

---

## 8. Manage anggota (khusus admin)

Halaman baru: `/pengaturan/anggota`

```
┌───────────────────────────────────────────────────────────────────────┐
│  Anggota Keluarga                              [+ Tambah Anggota]   │
│                                                                       │
│  👤 Suami    admin  Istri     •  sejak 29 Okt 2026    [Edit] [Hapus] │
│  👤 Istri    member  Suami     •  sejak 29 Okt 2026    [Edit] [Hapus] │
│  👤 Rana     child   Anak      •  sejak 29 Okt 2026    [Edit] [Hapus] │
└───────────────────────────────────────────────────────────────────────┘
```

Tambah anggota: nama, username, password, role, relation, (untuk anak) batas
belanja bulanan.

Aturan:
- Hanya admin yang boleh akses.
- Admin **tidak bisa menghapus dirinya sendiri**.
- Menghapus anggota → datanya tetap ada (`recorded_by` jadi NULL), transaksinya
  tetap muncul di report dengan label "(anggota dihapus)".
- Password anggota bisa di-reset admin.

**Bila admin menambah anggota baru:**
1. Insert ke `"user"` + `household_members`.
2. Kategori **tidak** perlu dicopy — sudah milik keluarga.
3. Budget anggota baru = kosong. Admin perlu isi manual (atau disalin dari
   anggota lain via tombol "Salin budget dari").

---

## 9. Urutan implementasi

| Fase | Isi | Risiko |
|---|---|---|
| **1** | Migration: `households`, `household_members`, ubah `user`/`user_sessions`, `recorded_by`, `is_shared`, dedup + backfill kategori | **Tinggi** — backfill kategori |
| **2** | Auth: `lib/auth-simple.ts` + `lib/session.ts` session baru, `requireAdmin` | Sedang |
| **3** | Ganti 23 file `LOCAL_USER_ID` → `requireUserId()` | Rendah (mekanis) |
| **4** | `lib/scope.ts` + query jadi `ANY(?)` | Sedang |
| **5** | Scope switcher + dashboard per-anggota | Sedang |
| **6** | Tabel pengeluaran: group-by, badge "input oleh", kolom sumber dana | Sedang |
| **7** | Form "+ Tambah Sebagai" | Sedang |
| **8** | Halaman Kategori & Budget: kategori bersama, budget per orang | Sedang |
| **9** | `/pengaturan/anggota` + role guard | Sedang |
| **10** | Mode anak: halaman anak, guard route, limit | Sedang |

Fase 1–3 harus jalan dulu sebelum ada manfaat yang terlihat. Fase 5–7 adalah
bagian yang paling terasa penggunanya.

**Perkiraan: fase 1–7 ≈ 3–4 hari kerja, fase 8–10 ≈ 2–3 hari.**

---

## 10. Yang perlu diputuskan sebelum implementasi

1. **Anggota baru & kategori** — kalau administered sudah punya kategori sendiri
   yang unik (mis. "Kainan Sultan"), kategori itu jadi milik keluarga setelah
   migrasi. Kalau tidak mau tercampur, perlu keputusan: salin ke daftar
   keluarga atau tetap eksklusif. Default rancangan: semua masuk daftar keluarga.

2. **Budget anggota baru** — kosong (harus diisi manual), atau disalin otomatis
   dari admin? Default rancangan: kosong + tombol "Salin dari".

3. **Anggota dengan `is_shared = 0`** — dompet pribadi Suami. Tab "Keluarga"
   mengabaikannya? Default rancangan: ya, abaikan, tapi tampilkan sebagai
   "di luar scope keluarga" di Catatan.

4. **Anak boleh buat dompet sendiri?** Default rancangan: tidak — anak cuma
   mencatat pengeluaran, dompet dibuat admin.

5. **Email** — tabel `user` punya `email NOT NULL UNIQUE`. Untuk anggota baru
   boleh diisi dummy (`anak1@keluarga.local`) atau dibikin nullable. Default
   rancangan: nullable.

---

## 11. Risiko & catatan

- **Backup wajib sebelum fase 1.** Fase 1 mengubah `user_sessions` dan
  `credentials` (dihapus), dan menghapus 72 baris kategori duplikat.
  Steps yang tersedia: `pg_dump` sebelum, `git checkout` kalau perlu rollback.

- **ID `local-user` harus dipertahankan** sebagai ID Suami. Kalau diganti, 500+
  baris data harus di-rekey dan semua FK harus diperbarui. Cukup dengan
  `INSERT INTO household_members ... 'local-user'`.

- **`fundamental_analyses` tetap per-user.** Analisis saham tidak keluarga.

- **Tidak ada tabel "keluarga" untuk transaksi.** Kalau nanti butuh "total
  pengeluaran keluarga" yang beda dari "total semua anggota" (mis. anak punya
  uang saku sendiri yang tidak ikut hitungan), itu solved dengan
  `wallets.is_shared` — bukan dengan tabel baru.

- **`export`/`import` perlu diperbarui** — sekarang hanya dump `user_id =
  LOCAL_USER_ID`. Setelah multi-user, dump harus ikut household, dan import
  perlu menangani `recorded_by` + INSERT anggota baru.

- **Session cookie** tidak berubah format, jadi user yang sedang login tetap
  valid — tapi `validateSession` sekarang butuh JOIN ke `user`, jadi baris
  session lama harus di-backfill `user_id` (sudah ada di §4.2).
