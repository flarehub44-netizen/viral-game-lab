import {
  INITIAL_WALLET_BALANCE,
  MAX_TRANSACTION_HISTORY,
} from "./constants";
import type { Transaction } from "./types";

const KEY = "ns_wallet_v1";

export interface PersistedWallet {
  balance: number;
  totalWagered: number;
  totalPaidOut: number;
  transactions: Transaction[];
}

function defaultWallet(): PersistedWallet {
  return {
    balance: INITIAL_WALLET_BALANCE,
    totalWagered: 0,
    totalPaidOut: 0,
    transactions: [],
  };
}

function sanitizeTx(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const id = typeof t.id === "string" ? t.id : "";
  if (!id) return null;
  const kind = t.kind;
  if (kind !== "bet_lock" && kind !== "payout" && kind !== "refund") return null;
  return {
    id,
    kind,
    amount: toNonNegNumber(t.amount),
    balanceBefore: toNonNegNumber(t.balanceBefore),
    balanceAfter: toNonNegNumber(t.balanceAfter),
    createdAt: toNonNegNumber(t.createdAt),
    note: typeof t.note === "string" ? t.note : undefined,
  };
}

function toNonNegNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function loadWallet(): PersistedWallet {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultWallet();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return defaultWallet();
    const o = parsed as Record<string, unknown>;
    const txs = Array.isArray(o.transactions)
      ? o.transactions.map(sanitizeTx).filter(Boolean) as Transaction[]
      : [];
    return {
      balance: toNonNegNumber(o.balance) || INITIAL_WALLET_BALANCE,
      totalWagered: toNonNegNumber(o.totalWagered),
      totalPaidOut: toNonNegNumber(o.totalPaidOut),
      transactions: txs.slice(-MAX_TRANSACTION_HISTORY),
    };
  } catch {
    return defaultWallet();
  }
}

export function saveWallet(data: PersistedWallet): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("[walletStore] Falha ao persistir carteira (localStorage cheio?):", e);
    return false;
  }
}

export function appendTransaction(
  data: PersistedWallet,
  tx: Omit<Transaction, "id" | "createdAt"> & Partial<Pick<Transaction, "id" | "createdAt">>,
): PersistedWallet {
  const full: Transaction = {
    id: tx.id ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: tx.createdAt ?? Date.now(),
    kind: tx.kind,
    amount: tx.amount,
    balanceBefore: tx.balanceBefore,
    balanceAfter: tx.balanceAfter,
    note: tx.note,
  };
  const transactions = [...data.transactions, full].slice(-MAX_TRANSACTION_HISTORY);
  return { ...data, transactions };
}
