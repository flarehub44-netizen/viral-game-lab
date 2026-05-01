export type TransactionKind = "bet_lock" | "payout" | "refund";

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: number;
  note?: string;
}
