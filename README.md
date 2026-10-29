# Money Management

Aplikasi manajemen keuangan pribadi (Next.js 16 · React 19 · TypeScript · Tailwind v4) dengan database **PostgreSQL**.

## Kebutuhan

- Node.js 20+ / Bun
- PostgreSQL 14+ ( lokal, Docker, atau server )

## Setup

```bash
# 1. install dependency
npm install

# 2. isi koneksi database (.env.local)
cp .env.example .env.local
# DATABASE_URL=postgres://user:password@localhost:5432/money_management

# 3. jalankan migrasi (membuat schema + data default)
npm run migrate

# 4. jalankan aplikasi
npm run dev
```

Login default: **TONAS** / **12346** (ubah lewat menu Pengaturan).

## Database

Semua akses database lewat `pg` (async). Layer database ada di `lib/db.ts`:

- `db.prepare(sql).all(...)` / `.get(...)` / `.run(...)` — mengembalikan **Promise**, jadi harus di-`await`.
- Placeholder masih ditulis gaya SQLite (`?`) lalu otomatis diterjemahkan ke `$1, $2, ...`.
- `db.transaction(async () => { ... })` — memakai `AsyncLocalStorage`, jadi query di dalam callback otomatis memakai koneksi transaksi yang sama.
- Flag boolean tetap disimpan sebagai INTEGER `0/1` (bukan BOOLEAN) supaya query yang sudah ada tidak perlu diubah.

### Migrasi

File SQL ada di `migrations/`, dijalankan berurutan dan dicatat di tabel `schema_migrations`:

```bash
npm run migrate
```

### Migrasi data dari SQLite lama

Kalau sebelumnya pakai versi SQLite (file `money-management.db`), datanya bisa dipindahkan:

```bash
npm run migrate                     # schema dulu
npm run migrate:sqlite              # data dari file SQLite lama
```

Default lokasi file SQLite yang dicari: `%APPDATA%/TOnas/money-management.db` (Windows). Bisa juga diberi path eksplisit:

```bash
npm run migrate:sqlite -- /path/ke/money-management.db
```

### Menjalankan Postgres lokal dengan Docker

```bash
docker run -d --name money-management-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=money_management \
  -p 5432:5432 postgres:16
```

### Smoke test

```bash
bun scripts/smoke.ts
```

Script ini mengecek query dashboard, daftar transaksi, transaksi database (commit/rollback), dan jalur tulis (income, transfer, investasi, pinjaman).

## Deploy ke server

Build Next.js:

```bash
npm run build
npm start          # atau: node .next/standalone/server.js
```

Set environment variable berikut di server:

```
DATABASE_URL=postgres://user:password@host:5432/money_management
# DATABASE_SSL=true     # kalau server mewajibkan SSL
# DB_POOL_MAX=10        # jumlah koneksi maksimum di pool
```

Jalankan migrasi sekali di server sebelum aplikasi dipakai:

```bash
DATABASE_URL=... npm run migrate
```

## Command

```bash
npm run dev        # dev server (Turbopack)
npm run build      # production build
npm start          # serve production build
npm run lint       # eslint
npm run migrate    # jalankan migrasi database
```
