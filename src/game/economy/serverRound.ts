import type { VisualResult } from "./multiplierTable";

/** Resposta JSON da Edge Function `start-round`. */
export interface StartRoundResponse {
  ok: boolean;
  round_id: string;
  stake_amount: number;
  target_multiplier: number;
  result_multiplier: number;
  payout_amount: number;
  net_result: number;
  visual_result: VisualResult;
  layout_seed?: string;
  layout_signature?: string;
  target_barrier?: number;
  max_duration_seconds?: number;
  round_status?: "open" | "closed" | "expired" | "rejected";
  idempotency_key?: string;
}

export interface EndRoundResponse {
  ok: boolean;
  round_id: string;
  round_status: "closed" | "expired" | "rejected";
  result_multiplier: number;
  payout_amount: number;
  net_result: number;
  /** Verdadeiro se o jogador atingiu a meta de barreiras (e portanto recebeu o pagamento). */
  reached_target?: boolean;
  forced_by_timeout: boolean;
  already_settled?: boolean;
  error?: string;
}

/** Estado mantido no cliente até o fim da animação (já liquidado no servidor). */
export interface ActiveServerRound extends StartRoundResponse {
  visual_result: VisualResult;
}

/** Resumo para a tela de fim de jogo (já liquidado no servidor ou no demo). */
export interface ServerEconomyPayload {
  stake: number;
  resultMultiplier: number;
  payout: number;
  netResult: number;
  /** LIVE: true se a meta foi atingida e o jogador recebeu o pagamento. DEMO: ignorado. */
  reachedTarget: boolean;
  /** Quantas barreiras o jogador passou. */
  barriersPassed: number;
  /** LIVE: meta de barreiras que precisava passar. DEMO: 0 (sem meta). */
  targetBarrier: number;
  /** Modo da rodada — controla a apresentação do GameOver. */
  mode?: "demo" | "live";
}

export interface RoundHistoryRow {
  id: string;
  created_at: string;
  stake: number;
  result_multiplier: number;
  payout: number;
  net_result: number;
}
