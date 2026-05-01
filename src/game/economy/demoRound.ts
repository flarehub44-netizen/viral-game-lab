import { mulberry32 } from "./settlement";
import { buildVisualResult, sampleMultiplier } from "./multiplierTable";
import {
  appendTransaction,
  loadWallet,
  saveWallet,
  type PersistedWallet,
} from "./walletStore";
import { MAX_ROUND_PAYOUT, MIN_STAKE, MAX_STAKE } from "./constants";
import { pushDemoHistoryRow } from "./demoHistory";
import type { ActiveServerRound } from "./serverRound";

const TARGET_MULT = 20;
const MIN_TARGET_MULT = 2;

export interface DemoRoundError {
  error: "insufficient_balance" | "invalid_stake";
}

function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Espelha o arredondamento da Edge `start-round`. */
export function computeRoundEconomy(stake: number, rng: () => number): {
  stakeRounded: number;
  resultMultiplier: number;
  payout: number;
  netResult: number;
  visual: ReturnType<typeof buildVisualResult>;
} {
  const stakeRounded = Math.round(stake * 100) / 100;
  const resultMultiplier = sampleMultiplier(rng);
  let payout = Math.round(stakeRounded * resultMultiplier * 100) / 100;
  if (payout > MAX_ROUND_PAYOUT) {
    payout = MAX_ROUND_PAYOUT;
  }
  const netResult = Math.round((payout - stakeRounded) * 100) / 100;
  const visual = buildVisualResult(resultMultiplier);
  return { stakeRounded, resultMultiplier, payout, netResult, visual };
}

export function validateStakeAmount(stake: number): boolean {
  if (!Number.isFinite(stake)) return false;
  const r = Math.round(stake * 100) / 100;
  return r >= MIN_STAKE && r <= MAX_STAKE;
}

function sanitizeTargetMultiplier(value: number): number {
  if (!Number.isFinite(value)) return TARGET_MULT;
  const rounded = Math.round(value);
  if (rounded < MIN_TARGET_MULT) return MIN_TARGET_MULT;
  if (rounded > TARGET_MULT) return TARGET_MULT;
  return rounded;
}

function mapMultiplierToLayout(mult: number): { targetBarrier: number; maxDurationSeconds: number } {
  if (mult <= 0) return { targetBarrier: 4, maxDurationSeconds: 10 };
  if (mult <= 0.2) return { targetBarrier: 6, maxDurationSeconds: 14 };
  if (mult <= 0.5) return { targetBarrier: 9, maxDurationSeconds: 18 };
  if (mult <= 0.8) return { targetBarrier: 12, maxDurationSeconds: 24 };
  if (mult <= 1) return { targetBarrier: 14, maxDurationSeconds: 28 };
  if (mult <= 1.5) return { targetBarrier: 18, maxDurationSeconds: 34 };
  if (mult <= 2) return { targetBarrier: 21, maxDurationSeconds: 40 };
  if (mult <= 3) return { targetBarrier: 25, maxDurationSeconds: 46 };
  if (mult <= 5) return { targetBarrier: 30, maxDurationSeconds: 54 };
  if (mult <= 10) return { targetBarrier: 36, maxDurationSeconds: 62 };
  return { targetBarrier: 42, maxDurationSeconds: 72 };
}

/**
 * Inicia uma rodada demo: debita APENAS a entrada da carteira.
 * O pagamento é creditado depois, em `settleDemoRound`, somente se o jogador
 * atingir a meta de barreiras (skill puro).
 */
export function startDemoRound(stake: number, targetMultiplier = TARGET_MULT):
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
  const target = sanitizeTargetMultiplier(targetMultiplier);
  const rng = mulberry32(seedFromString(roundId));
  const econ = computeRoundEconomy(stake, rng);
  const layout = mapMultiplierToLayout(econ.resultMultiplier);

  const balanceBefore = wallet.balance;
  const afterStake = Math.round((balanceBefore - econ.stakeRounded) * 100) / 100;

  wallet = appendTransaction(wallet, {
    kind: "bet_lock",
    amount: econ.stakeRounded,
    balanceBefore,
    balanceAfter: afterStake,
    note: `demo:${roundId}`,
  });

  wallet = {
    ...wallet,
    balance: afterStake,
    totalWagered: wallet.totalWagered + econ.stakeRounded,
  };

  saveWallet(wallet);

  const round: ActiveServerRound = {
    ok: true,
    round_id: roundId,
    stake_amount: econ.stakeRounded,
    target_multiplier: target,
    result_multiplier: econ.resultMultiplier,
    payout_amount: econ.payout, // pagamento POTENCIAL caso atinja meta
    net_result: econ.netResult, // resultado POTENCIAL caso atinja meta
    visual_result: econ.visual,
    layout_seed: `demo:${roundId}`,
    layout_signature: `demo_sig_${roundId}`,
    target_barrier: layout.targetBarrier,
    max_duration_seconds: layout.maxDurationSeconds,
    round_status: "open",
    idempotency_key: `demo_${roundId}`,
  };

  return { ok: true, round, wallet };
}

/**
 * Liquida a rodada demo: credita o pagamento APENAS se o jogador atingiu a meta de barreiras.
 * Caso contrário, mantém saldo (entrada já foi debitada em startDemoRound).
 */
export function settleDemoRound(
  round: ActiveServerRound,
  barriersPassed: number,
): {
  payout: number;
  netResult: number;
  reachedTarget: boolean;
  wallet: PersistedWallet;
} {
  const targetBarrier = round.target_barrier ?? 0;
  const reachedTarget =
    targetBarrier > 0 && barriersPassed >= targetBarrier;

  let wallet = loadWallet();
  let payout = 0;

  if (reachedTarget) {
    payout = Math.round(round.stake_amount * round.result_multiplier * 100) / 100;
    if (payout > MAX_ROUND_PAYOUT) payout = MAX_ROUND_PAYOUT;

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
    result_multiplier: round.result_multiplier,
    payout,
    net_result: netResult,
  });

  return { payout, netResult, reachedTarget, wallet };
}
