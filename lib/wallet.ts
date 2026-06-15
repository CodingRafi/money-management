import { db } from "@/lib/db"

export function recalcWalletBalances(userId: string) {
  db.prepare(`
    UPDATE wallets SET balance = initial_balance + (
      COALESCE((SELECT SUM(i.amount)   FROM incomes i   WHERE i.wallet_id      = wallets.id AND i.is_initial = 0), 0)
      - COALESCE((SELECT SUM(e.amount) FROM expenses e  WHERE e.wallet_id      = wallets.id AND e.is_initial = 0), 0)
      + COALESCE((SELECT SUM(t.amount) FROM transfers t WHERE t.to_wallet_id   = wallets.id AND t.is_initial = 0), 0)
      - COALESCE((SELECT SUM(t.amount) FROM transfers t WHERE t.from_wallet_id = wallets.id AND t.is_initial = 0), 0)
      - COALESCE((SELECT SUM(it.total_amount) FROM investment_transactions it WHERE it.from_wallet_id = wallets.id AND it.type = 'BUY'  AND it.is_initial = 0), 0)
      + COALESCE((SELECT SUM(it.total_amount) FROM investment_transactions it WHERE it.to_wallet_id   = wallets.id AND it.type = 'SELL' AND it.is_initial = 0), 0)
    )
    WHERE user_id = ?
  `).run(userId)
}
