/**
 * Smoke test: memastikan query aplikasi berjalan baik di PostgreSQL.
 * Jalankan: bun scripts/smoke.ts
 */
import { db } from "../lib/db"
import {
  getWealthOverview,
  getCashflow,
  getWallets,
  getInvestment,
  getLoans,
  getCategoryBreakdown,
  getRecentTransactions,
  getRecentCashflowTx,
} from "../lib/dashboard"
import { getCashflowTxList, getInvestmentTxList, getLoanPaymentList } from "../lib/tx-list"
import { recalcWalletBalances } from "../lib/wallet"
import { seedUserCategories } from "../lib/seedUserCategories"
import { ensureYearlyCategories } from "../lib/ensureYearlyCategories"
import crypto from "crypto"

const uid = () => crypto.randomUUID()
const USER = "local-user"

async function main() {
  console.log("1. seed kategori user...")
  await seedUserCategories(USER)
  await ensureYearlyCategories(USER, new Date().getFullYear())

  console.log("2. insert wallet + transaksi...")
  const catRow = await db.prepare("SELECT id FROM wallet_categories LIMIT 1").get() as { id: string }
  const walletId = uid()
  await db.prepare(
    "INSERT INTO wallets (id, user_id, category_id, name, is_liquid, is_active, sort_order, balance, initial_balance) VALUES (?, ?, ?, ?, 1, 1, 1, 0, 0)",
  ).run(walletId, USER, catRow.id, "Smoke Wallet")

  const year = new Date().getFullYear()
  const month = new Date().getMonth() + 1
  const date = `${year}-${String(month).padStart(2, "0")}-01`

  await db.prepare(
    "INSERT INTO incomes (id, user_id, date, name, amount, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
  ).run(uid(), USER, date, "Gaji", 5_000_000, month, year)

  await db.prepare(
    "INSERT INTO expenses (id, user_id, date, name, amount, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
  ).run(uid(), USER, date, "Makan", 750_000, month, year)

  await db.prepare(
    "INSERT INTO transfers (id, user_id, from_wallet_id, to_wallet_id, amount, date, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
  ).run(uid(), USER, walletId, walletId, 100_000, date, month, year)

  await db.prepare(
    "INSERT INTO investments (id, user_id, category_id, name, is_liquid, is_active, is_closed) VALUES (?, ?, ?, ?, 1, 1, 0)",
  ).run(uid(), USER, (await db.prepare("SELECT id FROM investment_categories LIMIT 1").get() as { id: string }).id, "Saham Smoke")

  const invId = (await db.prepare("SELECT id FROM investments WHERE name = 'Saham Smoke' LIMIT 1").get() as { id: string }).id
  await db.prepare(
    "INSERT INTO investment_transactions (id, investment_id, type, quantity, price_per_unit, total_amount, date, year, is_initial) VALUES (?, ?, 'BUY', '1', 1000, 1000, ?, ?, 0)",
  ).run(uid(), invId, date, year)

  console.log("3. recalc saldo dompet...")
  await recalcWalletBalances(USER)

  console.log("4. jalankan query dashboard...")
  const wealth = await getWealthOverview(USER, year)
  console.log("   wealth  :", JSON.stringify({
    totalDompet: wealth.totalDompet,
    totalInvestasi: wealth.totalInvestasi,
    piutangSisa: wealth.piutangSisa,
    hutangSisa: wealth.hutangSisa,
    emergencyFundMonths: wealth.emergencyFundMonths,
  }))
  console.log("   cashflow:", JSON.stringify(await getCashflow(USER, month, year)))
  console.log("   wallets :", JSON.stringify(await getWallets(USER)))
  console.log("   invest  :", JSON.stringify(await getInvestment(USER)))
  console.log("   loans   :", JSON.stringify(await getLoans(USER)))
  console.log("   kategori:", JSON.stringify(await getCategoryBreakdown(USER, month, year)))
  console.log("   recent  :", (await getRecentTransactions(USER)).length, "transaksi")
  console.log("   recentCF:", (await getRecentCashflowTx(USER)).length, "baris")

  console.log("5. daftar transaksi...")
  console.log("   cashflowList:", JSON.stringify(await getCashflowTxList(USER, { limit: 3 })).slice(0, 200))
  console.log("   investList  :", JSON.stringify(await getInvestmentTxList(USER, { limit: 3 })).slice(0, 200))
  console.log("   loanList    :", JSON.stringify(await getLoanPaymentList(USER, { limit: 3 })).slice(0, 200))

  console.log("6. transaksi DB + rollback...")
  await db.transaction(async () => {
    await db.prepare("INSERT INTO incomes (id, user_id, date, name, amount, month, year) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      uid(), USER, date, "Uji transaksi", 1000, month, year,
    )
    const n = await db.prepare("SELECT COUNT(*) AS c FROM incomes WHERE name = 'Uji transaksi'").get() as { c: number }
    console.log("   baris dalam transaksi:", n.c)
    throw new Error("rollback testing")
  }).catch((e) => console.log("   rollback OK:", (e as Error).message))
  const after = await db.prepare("SELECT COUNT(*) AS c FROM incomes WHERE name = 'Uji transaksi'").get() as { c: number }
  console.log("   baris setelah rollback:", after.c, after.c === 0 ? "(benar)" : "(SALAH!)")

  console.log("7. jalur tulis (replikasi logic server action)...")
  // Tambahincome ke dompet -> saldo naik
  await db.transaction(async () => {
    await db.prepare(
      "INSERT INTO incomes (id, user_id, date, name, wallet_id, amount, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
    ).run(uid(), USER, date, "Gaji", walletId, 2_000_000, month, year)
    await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?").run(2_000_000, walletId, USER)
  })
  let w = await db.prepare("SELECT balance FROM wallets WHERE id = ?").get(walletId) as { balance: number }
  console.log("   saldo setelah income:", w.balance)

  // Transfer antar dompet
  const w2 = uid()
  await db.prepare(
    "INSERT INTO wallets (id, user_id, category_id, name, is_liquid, is_active, sort_order, balance, initial_balance) VALUES (?, ?, ?, ?, 1, 1, 2, 0, 0)",
  ).run(w2, USER, catRow.id, "Smoke Wallet 2")
  await db.transaction(async () => {
    await db.prepare(
      "INSERT INTO transfers (id, user_id, from_wallet_id, to_wallet_id, amount, date, month, year, is_initial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)",
    ).run(uid(), USER, walletId, w2, 500_000, date, month, year)
    await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ? AND user_id = ?").run(500_000, walletId, USER)
    await db.prepare("UPDATE wallets SET balance = balance + ? WHERE id = ? AND user_id = ?").run(500_000, w2, USER)
  })
  const bal = await db.prepare("SELECT id, balance FROM wallets WHERE id IN (?, ?) ORDER BY id").all(walletId, w2) as { id: string; balance: number }[]
  console.log("   saldo setelah transfer:", bal.map((b) => b.balance).join(" / "))

  // Beli investasi (saldo dompet berkurang)
  await db.transaction(async () => {
    const balRow = await db.prepare("SELECT balance FROM wallets WHERE id = ? AND is_active = 1").get(walletId) as { balance: number }
    if (balRow.balance < 1000) throw new Error("Saldo tidak mencukupi")
    await db.prepare(
      "INSERT INTO investment_transactions (id, investment_id, type, quantity, price_per_unit, total_amount, from_wallet_id, date, year, is_initial) VALUES (?, ?, 'BUY', '1', 1000, 1000, ?, ?, ?, 0)",
    ).run(uid(), invId, walletId, date, year)
    await db.prepare("UPDATE wallets SET balance = balance - ? WHERE id = ?").run(1000, walletId)
  })
  w = await db.prepare("SELECT balance FROM wallets WHERE id = ?").get(walletId) as { balance: number }
  console.log("   saldo setelah beli investasi:", w.balance)

  // Pinjaman + pembayaran
  const loanId = uid()
  await db.prepare(
    "INSERT INTO loans (id, user_id, type, name, principal_amount, interest_rate, interest_type, start_date, due_date, wallet_id, status, is_active, is_initial) VALUES (?, ?, 'PIUTANG', 'Pinjaman uji', 1000000, 0, 'FLAT', ?, ?, ?, 'ONGOING', 1, 0)",
  ).run(loanId, USER, date, date, walletId)
  await db.prepare(
    "INSERT INTO loan_payments (id, loan_id, principal_paid, interest_paid, total_paid, date, is_initial) VALUES (?, ?, ?, 0, ?, ?, 0)",
  ).run(uid(), loanId, 250_000, 250_000, date)
  const loanData = await getLoans(USER)
  console.log("   loans setelah pembayaran:", JSON.stringify(loanData.piutang.items.map((i) => ({ n: i.name, sisa: i.sisa }))))

  console.log("\nSMOKE TEST SELESAI")
  process.exit(0)
}

main().catch((err) => {
  console.error("GAGAL:", err)
  process.exit(1)
})
