import {
  appendTransaction,
  loadWallet,
  saveWallet,
  type PersistedWallet,
} from "./walletStore";
import { MAX_ROUND_PAYOUT, MIN_STAKE, MAX_STAKE } from "./constants";
import { pushDemoHistoryRow } from "./demoHistory";
import type { ActiveServerRound } from "./serverRound";
import { multiplierForBarriers } from "./multiplierCurve";

/**
 * DEMO usa a MESMA curva pública `m(b)` do modo online (Fase 1 payout dinâmico).
 * O parâmetro `base` permanece como referência visual ("alvo do jogador") mas não
 * altera mais o ganho — assim a experiência demo prepara o jogador para a real.
 */

/** @deprecated Mantido para compatibilidade com a UI; não afeta mais o cálculo de ganho. */
export const DEMO_MULTIPLIER_PER_BARRIER_FACTOR = 0.05;

/** DEMO: bases de multiplicador disponíveis ao jogador (referência visual). */
export const DEMO_BASE_OPTIONS = [2, 5, 10, 20] as const;
export type DemoBase = (typeof DEMO_BASE_OPTIONS)[number];
/** DEMO: base padrão se nada for selecionado. */
export const DEMO_DEFAULT_BASE: DemoBase = 5;
/** DEMO: número de barreiras necessárias para atingir a meta da base escolhida. */
export const DEMO_GOAL_BARRIERS = 20;
/** DEMO: duração máxima da rodada (sem limite real, mas o engine precisa de algo). */
const DEMO_MAX_DURATION_SECONDS = 180;

export interface DemoRoundError {
  error: "insufficient_balance" | "invalid_stake" | "invalid_base";
}

export function validateStakeAmount(stake: number): boolean {
  if (!Number.isFinite(stake)) return false;
  const r = Math.round(stake * 100) / 100;
  return r >= MIN_STAKE && r <= MAX_STAKE;
}

export function isValidDemoBase(base: number): base is DemoBase {
  return (DEMO_BASE_OPTIONS as readonly number[]).includes(base);
}

/**
 * Multiplicador atual do DEMO — agora idêntico ao modo online (curva pública m(b)).
 * O parâmetro `base` é ignorado para cálculo (mantido na assinatura por compatibilidade).
 */
export function demoMultiplierFor(barriersPassed: number, _base?: number): number {
  return multiplierForBarriers(barriersPassed);
}

/**
 * Inicia uma rodada demo: debita APENAS a entrada da carteira.
 * O `base` escolhido (×2, ×5, ×10, ×20) define a velocidade do ganho linear:
 * cada barreira vale `entrada × 0,05 × base`. Sem meta obrigatória — o jogador
 * recebe o ganho proporcional ao número de barreiras passadas.
 */
export function startDemoRound(stake: number, base: number = DEMO_DEFAULT_BASE):
  | { ok: true; round: ActiveServerRound; wallet: PersistedWallet; base: DemoBase }
  | ({ ok: false } & DemoRoundError) {
  if (!validateStakeAmount(stake)) {
    return { ok: false, error: "invalid_stake" };
  }
  if (!isValidDemoBase(base)) {
    return { ok: false, error: "invalid_base" };
  }

  let wallet = loadWallet();
  const stakeRounded = Math.round(stake * 100) / 100;
  if (wallet.balance < stakeRounded) {
    return { ok: false, error: "insufficient_balance" };
  }

  const roundId = crypto.randomUUID();
  const balanceBefore = wallet.balance;
  const afterStake = Math.round((balanceBefore - stakeRounded) * 100) / 100;

  wallet = appendTransaction(wallet, {
    kind: "bet_lock",
    amount: stakeRounded,
    balanceBefore,
    balanceAfter: afterStake,
    note: `demo:${roundId}`,
  });

  wallet = {
    ...wallet,
    balance: afterStake,
    totalWagered: wallet.totalWagered + stakeRounded,
  };

  saveWallet(wallet);

  const round: ActiveServerRound = {
    ok: true,
    round_id: roundId,
    stake_amount: stakeRounded,
    target_multiplier: base, // base escolhida (referência da meta)
    result_multiplier: 0, // será definido em settle
    payout_amount: 0,
    net_result: -stakeRounded,
    visual_result: {
      barriers_crossed: 0,
      balls_count: 1,
      score_target: 0,
      duration_seconds: DEMO_MAX_DURATION_SECONDS,
      finish_type: "demo_skill",
    },
    layout_seed: `demo:${roundId}`,
    layout_signature: `demo_sig_${roundId}`,
    target_barrier: 0, // sem meta obrigatória
    max_duration_seconds: DEMO_MAX_DURATION_SECONDS,
    round_status: "open",
    idempotency_key: `demo_${roundId}`,
  };

  return { ok: true, round, wallet, base };
}

/**
 * Liquida a rodada demo:
 * - Multiplicador final = `0,05 × base × barreiras` (sem teto próprio).
 * - Pagamento = `stake × multiplicador` (capado em MAX_ROUND_PAYOUT por segurança).
 * - Sempre credita o pagamento (mesmo se 0).
 */
export function settleDemoRound(
  round: ActiveServerRound,
  barriersPassed: number,
): {
  payout: number;
  netResult: number;
  multiplier: number;
  wallet: PersistedWallet;
} {
  const base = round.target_multiplier > 0 ? round.target_multiplier : DEMO_DEFAULT_BASE;
  const multiplier = demoMultiplierFor(barriersPassed, base);
  let payout = Math.round(round.stake_amount * multiplier * 100) / 100;
  if (payout > MAX_ROUND_PAYOUT) payout = MAX_ROUND_PAYOUT;

  let wallet = loadWallet();

  if (payout > 0) {
    const balanceBefore = wallet.balance;
    const balanceAfter = Math.round((balanceBefore + payout) * 100) / 100;

    wallet = appendTransaction(wallet, {
      kind: "payout",
      amount: payout,
      balanceBefore,
      balanceAfter,
      note: `demo:${round.round_id}`,
    });

    wallet = {
      ...wallet,
      balance: balanceAfter,
      totalPaidOut: wallet.totalPaidOut + payout,
    };

    saveWallet(wallet);
  }

  const netResult = Math.round((payout - round.stake_amount) * 100) / 100;

  pushDemoHistoryRow({
    id: round.round_id,
    created_at: new Date().toISOString(),
    stake: round.stake_amount,
    result_multiplier: multiplier,
    payout,
    net_result: netResult,
  });

  return { payout, netResult, multiplier, wallet };
}
