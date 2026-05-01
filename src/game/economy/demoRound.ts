import {
  appendTransaction,
  loadWallet,
  saveWallet,
  type PersistedWallet,
} from "./walletStore";
import { MAX_ROUND_PAYOUT, MIN_STAKE, MAX_STAKE } from "./constants";
import { pushDemoHistoryRow } from "./demoHistory";
import type { ActiveServerRound } from "./serverRound";

/** DEMO: cap do multiplicador final por jogo. */
export const DEMO_MULTIPLIER_CAP = 5.0;
/** DEMO: cada barreira passada vale este multiplicador. */
export const DEMO_MULTIPLIER_PER_BARRIER = 0.05;
/** DEMO: duração máxima da rodada (sem limite real, mas o engine precisa de algo). */
const DEMO_MAX_DURATION_SECONDS = 180;

export interface DemoRoundError {
  error: "insufficient_balance" | "invalid_stake";
}

export function validateStakeAmount(stake: number): boolean {
  if (!Number.isFinite(stake)) return false;
  const r = Math.round(stake * 100) / 100;
  return r >= MIN_STAKE && r <= MAX_STAKE;
}

/**
 * Calcula o multiplicador final do DEMO a partir do número de barreiras passadas.
 * Fórmula linear: `min(barriers × 0.05, 5.0)`.
 */
export function demoMultiplierFor(barriersPassed: number): number {
  if (!Number.isFinite(barriersPassed) || barriersPassed <= 0) return 0;
  const raw = barriersPassed * DEMO_MULTIPLIER_PER_BARRIER;
  const capped = Math.min(raw, DEMO_MULTIPLIER_CAP);
  return Math.round(capped * 100) / 100;
}

/**
 * Inicia uma rodada demo: debita APENAS a entrada da carteira.
 * Não há sorteio prévio nem meta — o multiplicador final depende somente
 * do número de barreiras que o jogador conseguir passar.
 */
export function startDemoRound(stake: number):
  | { ok: true; round: ActiveServerRound; wallet: PersistedWallet }
  | ({ ok: false } & DemoRoundError) {
  if (!validateStakeAmount(stake)) {
    return { ok: false, error: "invalid_stake" };
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
    target_multiplier: 0, // sem meta no demo
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
    target_barrier: 0, // sem meta
    max_duration_seconds: DEMO_MAX_DURATION_SECONDS,
    round_status: "open",
    idempotency_key: `demo_${roundId}`,
  };

  return { ok: true, round, wallet };
}

/**
 * Liquida a rodada demo:
 * - Multiplicador final = `min(barriers × 0.05, 5.0)`.
 * - Pagamento = `stake × multiplicador` (capado em MAX_ROUND_PAYOUT).
 * - Sempre credita o pagamento (mesmo se 0).
 * - Não há "meta": o ganho é proporcional à habilidade.
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
  const multiplier = demoMultiplierFor(barriersPassed);
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
