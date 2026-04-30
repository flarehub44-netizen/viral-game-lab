import type { RoundSummaryOut } from "@/game/engine";
import {
  DEFAULT_META_MULTIPLIER,
  MIN_DURATION_ELIGIBLE_SEC,
  NOISE_AMPLITUDE,
  RTP_ADJUST_MAX,
  RTP_ADJUST_MIN,
  TARGET_RTP,
} from "./constants";
import type { RoundConfig, RoundSettlement } from "./types";

/** Gerador determinístico a partir de seed (auditável). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Performance 0..1 a partir do resumo da rodada (monotônico nos inputs típicos).
 */
export function performance01(summary: RoundSummaryOut): number {
  const scoreNorm = Math.min(1, summary.score / 420);
  const comboNorm = Math.min(1, summary.maxCombo / 22);
  const timeNorm = Math.min(1, summary.durationSeconds / 100);
  const aliveNorm = Math.min(1, summary.maxAlive / 40);
  let mix =
    scoreNorm * 0.42 +
    comboNorm * 0.28 +
    timeNorm * 0.18 +
    aliveNorm * 0.12;

  if (summary.durationSeconds < MIN_DURATION_ELIGIBLE_SEC) {
    mix *= summary.durationSeconds / MIN_DURATION_ELIGIBLE_SEC;
  }
  return clamp(mix, 0, 1);
}

/**
 * Multiplicador base só por skill (antes de RTP + ruído). Escalado para uso com meta.
 */
/**
 * Escala o ganho por skill em torno do RTP alvo (ajuste fino via constante).
 * Sem isso, `perf01 × meta` explode o RTP médio.
 */
export function basePerformanceMultiplier(
  summary: RoundSummaryOut,
  metaMultiplier: number,
): number {
  const p = performance01(summary);
  const scaled = p * metaMultiplier * TARGET_RTP * 0.088;
  return clamp(scaled, 0, metaMultiplier * 0.95);
}

export interface SettlementInputs {
  config: RoundConfig;
  summary: RoundSummaryOut;
  seed: number;
  /** totalPaidOut / totalWagered antes desta rodada */
  rtpObservedBefore: number;
}

/**
 * Calcula payout bruto e dados de auditoria (sem alterar persistência).
 */
export function computeSettlement(input: SettlementInputs): RoundSettlement {
  const { config, summary, seed, rtpObservedBefore } = input;
  const meta = config.metaMultiplier > 0 ? config.metaMultiplier : DEFAULT_META_MULTIPLIER;
  const rng = mulberry32(seed);

  const perf01 = performance01(summary);
  const perfMult = basePerformanceMultiplier(summary, meta);

  const observed =
    rtpObservedBefore > 0 && Number.isFinite(rtpObservedBefore)
      ? rtpObservedBefore
      : TARGET_RTP;

  const rtpAdjustment = clamp(
    1 + (TARGET_RTP - observed) * 0.55,
    RTP_ADJUST_MIN,
    RTP_ADJUST_MAX,
  );

  const noiseFactor = 1 + (rng() - 0.5) * 2 * NOISE_AMPLITUDE;

  let mult = perfMult * rtpAdjustment * noiseFactor;
  mult = clamp(mult, 0, meta);

  let grossPayout = Math.floor(config.bet * mult);
  const maxPay = config.bet * meta;
  grossPayout = Math.min(grossPayout, Math.floor(maxPay));

  const effectiveMultiplier = config.bet > 0 ? grossPayout / config.bet : 0;
  const netResult = grossPayout - config.bet;

  return {
    config,
    summary,
    effectiveMultiplier,
    grossPayout,
    netResult,
    audit: {
      performance01: perf01,
      performanceMultiplier: perfMult,
      rtpObservedBefore: observed,
      rtpAdjustment,
      noiseFactor,
      seed,
    },
  };
}
