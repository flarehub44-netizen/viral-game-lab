import type { RoundSummaryOut } from "@/game/engine";

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

/** Configuração da rodada econômica (snapshot ao iniciar). */
export interface RoundConfig {
  bet: number;
  metaMultiplier: number;
}

/** Resultado do settlement após o fim da partida. */
export interface RoundSettlement {
  config: RoundConfig;
  summary: RoundSummaryOut;
  /** Multiplicador efetivo aplicado sobre a entrada (payout / bet). */
  effectiveMultiplier: number;
  grossPayout: number;
  netResult: number;
  /** Componentes para auditoria / debug. */
  audit: {
    performance01: number;
    performanceMultiplier: number;
    rtpObservedBefore: number;
    rtpAdjustment: number;
    noiseFactor: number;
    seed: number;
  };
}

export interface WalletSnapshot {
  balance: number;
  reserved: number;
  totalWagered: number;
  totalPaidOut: number;
  transactions: Transaction[];
}
