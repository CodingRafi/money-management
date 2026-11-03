# Plan Fitur #6, #7, #8 — Simulasi Alokasi, Metrik Risiko, Monte Carlo & Stress Test

Status: **rencana (belum ada perubahan kode)**
Tanggal: 2026-11-04 · Branch target: `main`
Dokumen terkait: `docs/PLAN-BELUM-DICATAT.md` (#2)

---

## 0. Ringkasan & Dependency

Tiga fitur ini **satu sistem** dan harus dikerjakan berurutan karena berbagi fondasi data harga.

```
        ┌──────────────────────────────────────────────┐
        │  Fondasi: asset_prices + benchmark_prices    │
        │  (harga historis per aset & indeks)          │
        └───────────────┬──────────────────────────────┘
                        │
        ┌───────────────▼───────────────┐
        │  #7 Metrik risiko (engine)    │  ← pure function, tanpa I/O
        │  TWR, MaxDD, Sharpe, Sortino,  │
        │  VaR, korelasi, beta           │
        └───────────────┬───────────────┘
                        │
      ┌─────────────────┼──────────────────┐
      │                 │                  │
┌─────▼──────┐  ┌───────▼───────┐  ┌──────▼─────────┐
│ #6 Simulasi│  │ #8 Monte Carlo│  │ #8 Stress Test │
│ alokasi    │  │ (GBM/bootstrp)│  │ (skenario)     │
│ backtest   │  │ P10/P50/P90  │  │ -30% pasar     │
└────────────┘  └───────────────┘  └────────────────┘
```

**Estimasi total:** ~70 jam (~2 minggu kerja penuh).

> **Catatan urutan nomor:** di daftar awal, #6 = "backtesting & simulasi alokasi", #7 = "extended metrics (TWR, MaxDD, Sharpe/Sortino, VaR, korelasi, beta)", #8 = "Monte Carlo & stress test". Dokumen ini mengikuti penomoran itu.

---

## 1. Masalah & Kriteria Terima

### Masalah

Modul investasi sekarang sudah punya:
- Kalkulator fundamental 7 sektor (`lib/fundamental/*`) — analisis intrinsik per saham.
- Rekap investasi (`/investasi/rekap`) — komposisi modal, XIRR, growth bulanan.
- Transaksi BUY/SELL/DIVIDEND (`investment_transactions`).

Yang **belum ada**: pengguna tidak bisa menjawab *"kalau saya alokasi begini, hasilnya gimana?"* atau *"berapa risiko portofoliosaya?"*. Data yang juga tidak ada: **harga pasar historis** — tanpa itu, mark-to-market dan risk metrics mustahil.

### Kriteria Terima (DoD)

- [ ] Tabel harga historis terisi untuk setiap aset yang punya `unit` (saham/ETF) — minimal 3 tahun.
- [ ] Benchmark IHSG & emas tersedia untuk perbandingan.
- [ ] Halaman `/investasi/simulasi` menjalankan backtest alokasi (dana awal + kontribusi bulanan + bobot aset) dan menampilkan kurva nilai vs benchmark.
- [ ] Metrik risiko (TWR, MaxDD, Sharpe, Sortino, VaR, beta, matriks korelasi) tampil per portofolio dan per aset.
- [ ] Monte Carlo menghasilkan distribusi P5/P50/P95 + fan chart + probabilitas rugi.
- [ ] Stress test menjalankan ≥ 6 skenario (krisis 2008, COVID 2020, rate hike, custom) dan menampilkan dampak ke portofolio.
- [ ] Semua perhitungan **deterministik** (seeded RNG) — hasil sama untuk input sama.
- [ ] Tidak ada ketergantungan wajib ke API eksternal saat offline (data harga di-cache di DB).

---

## 2. Fondasi Data: Harga Historis

### 2.1 Migrasi `migrations/011_asset_prices.sql`

```sql
-- Harga historis per aset investasi (harian).
CREATE TABLE IF NOT EXISTS asset_prices (
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  date          TEXT NOT NULL,                    -- YYYY-MM-DD
  close         DOUBLE PRECISION NOT NULL CHECK (close > 0),
  source        TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'yahoo' | 'import'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (investment_id, date)
);

CREATE INDEX IF NOT EXISTS idx_asset_prices_date ON asset_prices (date);

-- Harga benchmark (indeks pasar, emas, Obligasi) untuk perbandingan.
CREATE TABLE IF NOT EXISTS benchmark_prices (
  code          TEXT NOT NULL,                    -- 'IHSG' | 'GOLD' | 'OBLIGASI_ID' | ...
  date          TEXT NOT NULL,
  close         DOUBLE PRECISION NOT NULL CHECK (close > 0),
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (code, date)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_prices_date ON benchmark_prices (code, date);

-- Aset boleh punya kode ticker supaya harga bisa di-sync otomatis.
ALTER TABLE investments ADD COLUMN IF NOT EXISTS ticker TEXT;
CREATE INDEX IF NOT EXISTS idx_investments_ticker ON investments (ticker);
```

> **ID adalah TEXT** (konsisten repo). Composite PK `(investment_id, date)` cukup untuk lookup deret waktu.

### 2.2 Sumber data harga

Ada **tiga** sumber, dengan prioritas:

1. **`manual`** — user mengetik harga lewat UI (`/investasi/aset/[id]`) atau lewat Telegram ("BBRI sekarang 4.250"). Selalu tersedia, tidak butuh internet.
2. **`yahoo`** — adapter opsional (`lib/market/yahoo.ts`) memakai endpoint chart publik `query1.finance.yahoo.com/v8/finance/chart/{TICKER}` untuk ticker format Yahoo (`BBRI.JK`, `ANTM.JK`, `GOLD=X`). Tidak butuh API key, tapi **rate-limited & bisa diblokir** → harus punya fallback dan tidak boleh jadi blocker.
3. **`import`** — CSV yang di-upload user (bulk).

Komponen:

```
lib/market/types.ts        → PricePoint, MarketDataSource interface
lib/market/yahoo.ts        → YahooChartSource (fetch + normalisasi)
lib/market/manual.ts       → ManualSource
lib/market/index.ts        → resolveSource(): pilih sumber, fallback berjenjang
lib/market/sync.ts         → syncInvestmentPrices(), syncBenchmark()
services/market.service.ts → orkestrasi + cache ke DB
```

### 2.3 Sinkronisasi

- Manual trigger: tombol "Sync harga" di halaman aset, atau `/investasi/harga` untuk sync massal.
- Cron opsional: `app/api/cron/price-sync/route.ts` (harian, skip bila `source='manual'`).
- **Wajib**: `try/catch` + logging; kegagalan sync tidak boleh menggagalkan halaman lain.

### 2.4 Backend testing: data dummy

Karena sync eksternal tidak deterministik, sediakan **seed data** untuk pengembangan & demo:

```sql
-- scripts/seed-prices.ts: mengisi asset_prices + benchmark_prices 3 tahun
-- dengan random walk berkorelasi (seeded), sehingga hasil simulasi stabil.
```

---

## 3. Layer Architecture

```
lib/risk/types.ts            → tipe bersama (NavPoint, RiskMetrics, Allocation, ...)
lib/risk/returns.ts          → turunan return harian→bulanan, log-return
lib/risk/metrics.ts          → TWR, MaxDD, Sharpe, Sortino, VaR, CVaR, beta, korelasi
lib/risk/portfolio.ts        → agregasi multi-aset → NAV series (dengan kontribusi)
lib/risk/simulation.ts       → backtest alokasi (#6)
lib/risk/montecarlo.ts       → simulasi stokastik (#8a)
lib/risk/stress.ts           → skenario stress (#8b)
lib/risk/benchmark.ts        → fetch & align benchmark series

repositories/price.repository.ts     → asset_prices & benchmark_prices
services/market.service.ts          → sinkronisasi harga
services/risk.service.ts             → orkestrasi: ambil data → hitung metrik → return DTO
app/actions/simulation.ts            → Server Actions (zod)
app/(protected)/investasi/simulasi/ → UI utama
```

Prinsip: **`lib/risk/*` = pure functions tanpa DB**. Semua input berupa array `{date, value}`. Ini membuat unit test mudah dan logika bisa dipakai ulang di Telegram tanpa query ulang.

---

## 4. #7 — Engine Metrik Risiko (fondasi)

### 4.1 Tipe

```ts
export type NavPoint = { date: string; value: number }

export type RiskMetrics = {
  // Return
  cagrPct: number | null
  twrPct: number | null            // Time-Weighted Return (mengabaikan kontribusi)
  totalReturnPct: number | null
  // Volatilitas & risk-adjusted
  volatilityPct: number | null      // stdev return bulanan * sqrt(12)
  sharpe: number | null
  sortino: number | null
  calmar: number | null
  // Drawdown
  maxDrawdownPct: number | null
  maxDrawdownDurationDays: number | null
  currentDrawdownPct: number | null
  // Risiko-tail
  var95Pct: number | null           // Value at Risk 95% (historikal, bulanan)
  cvar95Pct: number | null          // Conditional VaR (expected shortfall)
  // Relatif
  beta: number | null               // vs benchmark
  alphaPct: number | null
  correlation: number | null
  trackingErrorPct: number | null
  informationRatio: number | null
  // Statistik
  bestMonthPct: number | null
  worstMonthPct: number | null
  positiveMonthsPct: number | null
}
```

### 4.2 Rumus (harus konsisten & terdokumentasi)

| Metrik | Rumus | Konvensi |
|---|---|---|
| Return bulanan | `r_t = (V_t − V_{t−1}) / V_{t−1}` | simple return |
| Log return | `ln(V_t/V_{t−1})` | untuk volatilitas & korelasi |
| TWR | `∏(1 + r_t) − 1` | **dihitung dari NAV yang sudah dibersihkan kontribusi** |
| Volatilitas | `stdev(r_bulanan) × √12` | bulanan → tahunan |
| Sharpe | `(mean(r) − r_f) / stdev(r) × √12` | `r_f` = risk-free bulanan (default 0, configurable) |
| Sortino | `(mean(r) − MAR) / downsideDeviation × √12` | downside dev = stdev return negatif saja |
| Max Drawdown | `min( (V_t − max_{s≤t} V_s) / max_{s≤t} V_s )` | negatif, tampil absolut |
| VaR 95% | persentil 5 return bulanan | historikal; bulanan |
| CVaR 95% | mean return ≤ VaR | expected shortfall |
| Beta | `cov(r_port, r_bench) / var(r_bench)` | bulanan |
| Alpha | `mean(r_p) − (r_f + β(mean(r_b) − r_f))` | bulanan, CAPM |
| Korelasi | matriks Pearson dari log-return bulanan | antar aset & benchmark |

> Semua annualized rateof return tampil sebagai **desimal** di lapisan lib (0.12 = 12%) — konsisten dengan `lib/investment-metrics.ts` yang sudah memakai desimal.

### 4.3 NAV series dengan kontribusi (inti #6 & #8)

Problem: TWR dan Sharpe **harus** dihitung pada NAV yang sudah cleanshope kontribusi pengguna. Solusi: hitung **unitized NAV**.

```ts
export type Flow = { date: string; amount: number }   // amount > 0 = setoran pengguna

/**
 * Ubah (navPoints, flows) menjadi unitized NAV series:
 *  - Setiap kontribusi dicatat sebagai unit baru pada NAV saat itu.
 *  - Return dihitung dari perubahan NAV per unit (bukan NAV absolut),
 *    sehingga kontribusi kas TIDAK ikut dihitung sebagai Performance.
 */
export function unitizeNav(nav: NavPoint[], flows: Flow[]): { date: string; navPerUnit: number; units: number }[]
```

Implementasi:
1. events = gabung nav & flow, sort by date.
2. `units` += `flow / nav` saat ada flow; `navPerUnit = nav / units`.
3. return dari `navPerUnit` antar event.

Alternatif sederhana (dipakai bila flow complexity tinggi): hitung TWR dengan *Modified Dietz* per periode. **Rekomendasi: implement unitized NAV (exact), sediakan Dietz sebagai fallback & cross-check di test.**

### 4.4 Test wajib (`lib/risk/metrics.test.ts`, bun test)

| Kasus | Nilai erwartasi |
|---|---|
| NAV konstan 100 → return 0, volatilitas 0, MaxDD 0 | |
| NAV naik linier 100→200 dalam 12 bulan | MaxDD 0, CAGR ≈ 7,17% (bulanan Compound) |
| NAV: 100 → 50 → 100 | MaxDD = −50%, current DD 0 |
| Sharpe pada 1 titik volatilitas → null | |
| Beta aset vs benchmark identik = 1 | |
| Korelasi dua series identik = 1, series berlawanan = −1 | |
| Kontribusi 1jt/bulan tidak mengubah TWR (hanya NAV absolut) | regression guard |

---

## 5. #6 — Simulasi Alokasi / Backtest

### 5.1 Konsep

Pengguna menggeser slider: **"Kalau bulan ini saya alokasi dana 500jt begini, dan tiap bulan nambah 2jt selama 10 tahun, hasilnya gimana?"**

### 5.2 Input (Server Action `runSimulation`, zod)

```ts
type SimulationInput = {
  initialCapital: number
  monthlyContribution: number
  years: number                 // 1..40
  allocation: { investmentId: string; weight: number }[]   // weight decimal, total = 1
  benchmarkCode?: string        // 'IHSG' | 'GOLD' | ...
  rebalance: "NONE" | "MONTHLY" | "QUARTERLY" | "ANNUAL"
  rebalanceBandPct?: number     // toleransi sebelum rebalance (opsional)
  includeDividends: boolean
}
```

### 5.3 Output

```ts
type SimulationResult = {
  series: { date: string; portfolio: number; benchmark: number | null; contributions: number }[]
  metrics: RiskMetrics
  benchmarkMetrics: RiskMetrics | null
  perAsset: { investmentId: string; name: string; value: number; weight: number; metrics: RiskMetrics }[]
  assumptions: { startDate: string; endDate: string; dataSource: string; missingData: string[] }
}
```

### 5.4 Mekanika

1. Ambil deret harga bulanan tiap aset dari `asset_prices` (aggregate: last close per bulan).
2. Normalisasi: `idx_t = price_t / price_0` → kurva pertumbuhan.
3. Rekonstruksi **mulai dari transaksi historis user** bila aset ada (opsional): kalau user sudah punya BBRI 5jt, simulasi dimulai dari posisi existing + kontribusi baru.
4. Kontribusi bulanan diinvestasikan pada bobot target tiap bulan (bulanan = auto-rebalance).
5. Rebalance sesuai frekuensi: hitung bobot aktual tiap periode, jual/beli untuk kembali ke target (dengan asumsi biaya transaksi = `transactionCostPct`, default 0,15%).
6. Benchmark: deret `benchmark_prices` dinormalisasi, diasumsikan Kontribusi bulanan sama (agar perbandingan adil).
7. Hitung metrik via engine #7 (NAV + flow).

### 5.5 UI — `/investasi/simulasi`

Layout:
- **Panel kiri (kontrol)**: modal awal, kontribusi bulanan, horizon (slider tahun), tabel aset + bobot (slider + input persen), total bobot indicator (hijau 100% / merah ≠100%), frekuensi rebalance, benchmark, asumsi biaya.
- **Panel kanan (hasil)**: 
  - Line chart: nilai portofolio vs benchmark (Recharts `LineChart`, sudah dipakai di repo).
  - Area chart: *fan chart* untuk Monte Carlo (kalau #8 aktif).
  - Kartu metrik: TWR, CAGR, MaxDD, Sharpe, Sortino, VaR95.
  - Tabel per-aset: nilai akhir, bobot, return, MaxDD, beta.
  - Disclaimer: "Ini simulasi berdasarkan asumsi, bukan nasihat investasi."

Chart: `recharts` sudah jadi dependency — pakai `AreaChart`/`LineChart`/`BarChart` yang sudah dipakai di `app/(protected)/investasi/kebebasan-finansial/_components/fi-calculator.tsx`.

### 5.6 Preset & share

- Preset: "Semua dana darurat", "Dagang 70 / Obligasi 30", "Saham growth vs dividen".
- URL state: simpan input di query string (`?cap=500000000&contrib=2000000&years=10&alloc=...`) → bisa di-bookmark & dibagikan ke anggota keluarga.
- **Tidak** menyimpan hasil ke DB ( Stateless) kecuali user menekan "Simpan skenario" → tabel `saved_scenarios` (opsional, fase 2).

---

## 6. #8 — Monte Carlo & Stress Test

### 6.1 Monte Carlo (GBM + bootstrap)

Dua metode:

**a) Geometric Brownian Motion (parametrik)**
```
dS/S = μ dt + σ dW      → per bulan:
S_{t+1} = S_t × exp((μ − σ²/2)Δt + σ√Δt × Z),  Z ~ N(0,1)
```
μ & σ diestimasi dari log-return historis bulanan tiap aset.

**b) Bootstrap (historikal)**
Resample baris return historis (dengan replacement) → mempertahankan fat-tail & skew aslinya. Sangat berguna untuk saham Indonesia yang tidak normal.

**Metode default: bootstrap** (lebih jujur untuk data lokal), GBM sebagai toggle.

**Multi-aset:** korelasi antar aset harus dipertahankan → gunakan **Cholesky decomposition** dari matriks korelasi log-return, lalu transformasi sample normal → sample multivariat. Kalau matriks singular, tambahkan ridge kecil (ε = 1e-6) dan normalisasi diagonal.

**RNG deterministik:** `mulberry32(seed)` — hasil identik untuk seed sama. Seed ditampilkan di UI & bisa diisi manual.

Parameter:
```ts
type MonteCarloInput = {
  initialCapital: number
  monthlyContribution: number
  years: number
  allocation: { investmentId: string; weight: number }[]
  method: "BOOTSTRAP" | "GBM"
  iterations: number           // default 1000, maks 5000
  seed: number
  benchmarkCode?: string
}
```

Output:
```ts
type MonteCarloResult = {
  percentiles: { date: string; p5: number; p25: number; p50: number; p75: number; p95: number }[]
  finalStats: { p5: number; p50: number; p95: number; mean: number; std: number }
  probabilityOfLoss: number        // P(nilai akhir < modal awal)
  probabilityOfMissingTarget: number | null   // bila target diberikan
  ruinProbability: number          // P(nilai pernah ≤ 0)
  maxDrawdownDistribution: { p50: number; p95: number; worst: number }
  histogram: { bucket: string; count: number }[]
}
```

UI: fan chart (AreaChart dengan 4 band p5–p95), histogram nilai akhir, kartu "peluang rugi 23%", "peluang tidak mencapai target 41%", tabel ringkas.

Performa: 1000 iterasi × 12 tahun × 12 bulan × N aset → 144k–1,7jt operasi. Jalankan di **Web Worker** (`lib/risk/montecarlo.worker.ts`) supaya UI tidak freeze; fallback server-side bila worker tidak tersedia.

### 6.2 Stress Test

Skenario bawaan (built-in) + custom:

| Kode | Skenario | Dampak |
|---|---|---|
| `GFC_2008` | Krisis moneter global | Saham −50%, likuiditas beku, emas +5% |
| `COVID_2020` | Lockdown | Saham −35%, obligasi +3% |
| `RATE_HIKE` | Kenaikan suku bunga | Saham −20%, obligasi −8%, deposito +4% |
| `IDR_DEVAL` | Pelemahan rupiah | USD/aset global −12% dalam IDR |
| `LIQUIDITY` | Krisis likuiditas | Tidak bisa jual 30% portofolio, biaya +3% |
| `CUSTOM` | User sendiri | Shock per aset bebas |

Implementasi: `lib/risk/stress.ts` menerapkan shock ke kurva return bulanan → re-run simulasi → bandingkan NAV akhir vs baseline.

Output per skenario: NAV akhir, Δ%, MaxDD baru, hari recovery (bulan), skor dampak 1–5.

UI: tabel skenario + bar chart perbandingan, input custom shock per aset.

---

## 7. Integrasi ke Modul yang Ada

### 7.1 `/investasi/rekap`
Tambah tab/section **"Risiko"**: metrik portofolio gabungan, matriks korelasi (heatmap — implementasi sendiri dengan CSS grid, tanpa lib baru), drawdown chart.

### 7.2 `/investasi/aset/[id]`
- Input harga manual per tanggal + tombol "Sync" (kalau `ticker` terisi).
- Mini-metrik aset: XIRR (sudah ada), MaxDD, volatilitas, Sharpe, beta vs IHSG.
- Gambar kurva harga + garis moving average 50/200.

### 7.3 Dashboard
Card baru "Risiko Portofolio": MaxDD, volatilitas, Sharpe, dan "peringatan": "Portofolio kamu 70% terkonsentrasi di 1 sektor".

### 7.4 Telegram
Tool baru:
```
get_portfolio_risk        → ringkasan metrik risiko
run_simulation            → jalankan simulasi alokasi (ringkas, kirim chart sebagai file PNG)
get_stress_test           → hasil stress test
```
Format kartu baru di `lib/telegram/cards.ts` → `riskCard()`, `simulationCard()`.

### 7.5 Permission
Pakai resource existing: `PERMISSION.INVESTMENT.VIEW` (baca) & `PERMISSION.INVESTMENT.CREATE/UPDATE` (simpan skenario, input harga). Tidak perlu resource baru.

---

## 8. Lockdown & Risiko

| Risiko | Mitigasi |
|---|---|
| Data harga tidak lengkap (aset lama, ticker tidak ada) | Deteksi gap, tampilkan badge "data parsial", splice bergantian dengan cash (aset tanpa harga dianggap 0 return) |
| Yahoo diblokir / rate limit | Backoff + cache DB + fallback manual; tidak pernah jadi blocker halaman |
| Perhitungan salah (salah paham user) | Tampilkan asumsi & disclaimer; sertakan test case |
| Monte Carlo lambat | Worker + batas iterasi + cache hasil per hash input |
| Overfitting simulasi | Nyatakan eksplisit: "historis ≠ masa depan" |
| Data bocor antar anggota | Semua query lewat `scope.userIds`; harga aset privat per `user_id` |

---

## 9. Breakdown Task

### Fase A — Fondasi harga (Est. 18h)
| # | Task | File |
|---|---|---|
| A1 | Migrasi `asset_prices`, `benchmark_prices`, kolom `ticker` | `migrations/011_asset_prices.sql` |
| A2 | Tipe & interface sumber data | `lib/market/types.ts` |
| A3 | Adapter Yahoo + normalisasi | `lib/market/yahoo.ts` |
| A4 | Sinkronisasi & cache | `lib/market/sync.ts`, `services/market.service.ts` |
| A5 | Repository harga | `repositories/price.repository.ts` |
| A6 | UI input harga manual + sync | `app/(protected)/investasi/aset/[id]` |
| A7 | Seed data dummy (3 tahun) | `scripts/seed-prices.ts` |
| A8 | Cron sync harian (opsional) | `app/api/cron/price-sync/route.ts` |

### Fase B — Engine metrik #7 (Est. 20h)
| # | Task | File |
|---|---|---|
| B1 | Tipe bersama | `lib/risk/types.ts` |
| B2 | Turunan return (harian→bulanan, log) | `lib/risk/returns.ts` |
| B3 | TWR, MaxDD, volatilitas, Sharpe, Sortino, VaR, CVaR, beta, korelasi | `lib/risk/metrics.ts` |
| B4 | Unitized NAV + flow | `lib/risk/portfolio.ts` |
| B5 | Unit test (≥ 15 kasus) | `lib/risk/*.test.ts` |
| B6 | Agregasi multi-aset → portofolio | `lib/risk/portfolio.ts` |
| B7 | Service + DTO | `services/risk.service.ts` |
| B8 | Section "Risiko" di rekap + matriks korelasi | `app/(protected)/investasi/rekap/_components/RiskSection.tsx` |

### Fase C — Simulasi alokasi #6 (Est. 18h)
| # | Task | File |
|---|---|---|
| C1 | Engine backtest + rebalance + biaya | `lib/risk/simulation.ts` |
| C2 | Benchmark series + align | `lib/risk/benchmark.ts` |
| C3 | Server Action + zod | `app/actions/simulation.ts` |
| C4 | Halaman `/investasi/simulasi` (kontrol) | `app/(protected)/investasi/simulasi/page.tsx` |
| C5 | Chart & kartu metrik | `_components/SimulationChart.tsx`, `_components/MetricsCards.tsx` |
| C6 | Tabel per-aset + disclaimer | `_components/AssetBreakdown.tsx` |
| C7 | Preset + URL state | `_components/presets.ts` |
| C8 | Test engine (rebalance, biaya, benchmark) | `lib/risk/simulation.test.ts` |

### Fase D — Monte Carlo & stress #8 (Est. 16h)
| # | Task | File |
|---|---|---|
| D1 | RNG deterministik + GBM | `lib/risk/montecarlo.ts` |
| D2 | Bootstrap + korelasi multivariat (Cholesky) | `lib/risk/montecarlo.ts` |
| D3 | Worker | `lib/risk/montecarlo.worker.ts` |
| D4 | Fan chart + histogram | `_components/FanChart.tsx`, `_components/OutcomeHistogram.tsx` |
| D5 | Engine stress test + skenario | `lib/risk/stress.ts` |
| D6 | UI stress test | `_components/StressTable.tsx` |
| D7 | Card dashboard "Risiko Portofolio" | `components/dashboard/PortfolioRiskCard.tsx` |

### Fase E — Integrasi (Est. 8h)
| # | Task | File |
|---|---|---|
| E1 | Tool Telegram (risk, simulation, stress) | `lib/telegram/tools.ts`, `cards.ts` |
| E2 | Mini-metrik di halaman aset | `app/(protected)/investasi/aset/[id]` |
| E3 | Smoke test | `scripts/smoke.ts` |

**Total ≈ 80h** (termasuk buffer testing).

---

## 10. Verifikasi

```bash
bun test lib/risk/                      # semua metrik
bun scripts/seed-prices.ts              # data dummy 3 tahun
bun scripts/smoke.ts
bun dev
```

Checklist manual:
1. `/investasi/simulasi` → ubah slider alokasi → kurva & metrik berubah, total bobot indicator benar.
2. Bandingkan TWR simulasi vs XIRR `lib/investment-metrics.ts` untuk kasus sederhana → sanity check.
3. Monte Carlo dua kali dengan seed sama → hasil identik.
4. Stress test skenario `COVID_2020` → drawdown & Δ% sesuai ekspektasi manual.
5. Ganti scope personal/keluarga → portofolio & harga mengikuti scope.

---

## 11. sequenced Prioritas & Build Order

| Urutan | Deliverable | Nilai |
|---|---|---|
| 1 | **Fase A + B** | Risiko portofolio jadi terlihat — pondasi untuk semuanya |
| 2 | **Fase C** | Simulasi alokasi = fitur paling "wow" untuk pengguna |
| 3 | **Fase D** | Monte Carlo & stress = differentiate premium |
| 4 | **Fase E** | Integrasi = stickiness |

Kalau harus potong scope: **Fase D bisa ditunda**; A+B+C sudah menghasilkan produk yang utuh.
