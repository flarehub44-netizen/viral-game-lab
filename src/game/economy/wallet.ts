import type { RoundSummaryOut } from "@/game/engine";
import { TARGET_RTP } from "./constants";
import { computeSettlement } from "./settlement";
import {
  appendTransaction,
  loadWallet,
  saveWallet,
  type PersistedWallet,
} from "./walletStore";
import type { RoundConfig, RoundSettlement, WalletSnapshot } from "./types";

export type { RoundConfig, RoundSettlement, WalletSnapshot, Transaction } from "./types";

function toSnapshot(data: PersistedWallet): WalletSnapshot {
  return {
    balance: data.balance,
    reserved: data.reserved,
    totalWagered: data.totalWagered,
    totalPaidOut: data.totalPaidOut,
    transactions: [...data.transactions].reverse(),
  };
}

export function getWalletSnapshot(): WalletSnapshot {
  return toSnapshot(loadWallet());
}

/** Semeia rodada a partir de entrada + tempo (reprodutível para debug). */
export function deriveRoundSeed(parts: { bet: number; lockedAt: number; nonce: string }): number {
  const s = `${parts.nonce}|${parts.bet}|${parts.lockedAt}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface LockBetResult {
  ok: true;
  seed: number;
  balanceAfter: number;
}
export interface LockBetError {
  ok: false;
  reason: "insufficient_balance" | "invalid_bet";
}

/**
 * Debita a aposta e registra transação. Deve ser seguido por settleRound ou refundBet.
 */
export function lockBet(config: RoundConfig, nonce: string): LockBetResult | LockBetError {
  if (!Number.isFinite(config.bet) || config.bet <= 0) {
    return { ok: false, reason: "invalid_bet" };
  }
  let data = loadWallet();
  if (data.balance < config.bet) {
    return { ok: false, reason: "insufficient_balance" };
  }

  const lockedAt = Date.now();
  const seed = deriveRoundSeed({ bet: config.bet, lockedAt, nonce });
  const balanceBefore = data.balance;
  data.balance -= config.bet;
  data.totalWagered += config.bet;
  data = appendTransaction(data, {
    kind: "bet_lock",
    amount: config.bet,
    balanceBefore,
    balanceAfter: data.balance,
    note: `Aposta ${config.bet} créditos`,
  });
  saveWallet(data);

  return { ok: true, seed, balanceAfter: data.balance };
}

/**
 * Credita payout e atualiza métricas de RTP observado.
 */
export function settleRound(params: {
  config: RoundConfig;
  summary: RoundSummaryOut;
  seed: number;
}): RoundSettlement {
  let data = loadWallet();
  const bet = params.config.bet;
  const wageredExcludingThis =
    bet > 0 && data.totalWagered >= bet ? data.totalWagered - bet : data.totalWagered;
  const rtpBefore =
    wageredExcludingThis > 0 ? data.totalPaidOut / wageredExcludingThis : TARGET_RTP;

  const settlement = computeSettlement({
    config: params.config,
    summary: params.summary,
    seed: params.seed,
    rtpObservedBefore: rtpBefore > 0 ? rtpBefore : TARGET_RTP,
  });

  const balanceBefore = data.balance;
  data.balance += settlement.grossPayout;
  data.totalPaidOut += settlement.grossPayout;
  data = appendTransaction(data, {
    kind: "payout",
    amount: settlement.grossPayout,
    balanceBefore,
    balanceAfter: data.balance,
    note: `Pagamento ×${settlement.effectiveMultiplier.toFixed(2)}`,
  });
  saveWallet(data);

  return settlement;
}

/**
 * Devolve a aposta se o jogador saiu antes do fim (sem payout).
 */
export function refundBet(config: RoundConfig): void {
  let data = loadWallet();
  const balanceBefore = data.balance;
  data.balance += config.bet;
  data.totalWagered = Math.max(0, data.totalWagered - config.bet);
  data = appendTransaction(data, {
    kind: "refund",
    amount: config.bet,
    balanceBefore,
    balanceAfter: data.balance,
    note: "Partida cancelada — estorno da entrada",
  });
  saveWallet(data);
}
