/**
 * Tabela oficial MVP — RTP teórico ≈ 85,7% (discreto).
 * RTP empírico esperado pós-alongamento da curva: ~75-80% (curva 1.5x mais longa).
 * Espelhado em supabase/functions/_shared/multiplierTable.ts para a Edge Function.
 */

export interface VisualResult {
  barriers_crossed: number;
  balls_count: number;
  score_target: number;
  duration_seconds: number;
  finish_type: string;
}

export interface MultiplierTier {
  multiplier: number;
  probability: number;
  visual: VisualResult;
}

/** Probabilidades em ordem de multiplicador crescente (soma = 1). */
export const MULTIPLIER_TIERS: MultiplierTier[] = [
  {
    multiplier: 0,
    probability: 0.3,
    visual: {
      barriers_crossed: 7,
      balls_count: 3,
      score_target: 18,
      duration_seconds: 30,
      finish_type: "lose_early",
    },
  },
  {
    multiplier: 0.5,
    probability: 0.22,
    visual: {
      barriers_crossed: 17,
      balls_count: 5,
      score_target: 42,
      duration_seconds: 60,
      finish_type: "recover_partial",
    },
  },
  {
    multiplier: 0.8,
    probability: 0.16,
    visual: {
      barriers_crossed: 27,
      balls_count: 8,
      score_target: 68,
      duration_seconds: 80,
      finish_type: "almost_even",
    },
  },
  {
    multiplier: 1,
    probability: 0.11,
    visual: {
      barriers_crossed: 37,
      balls_count: 10,
      score_target: 88,
      duration_seconds: 100,
      finish_type: "break_even",
    },
  },
  {
    multiplier: 1.2,
    probability: 0.07,
    visual: {
      barriers_crossed: 47,
      balls_count: 12,
      score_target: 105,
      duration_seconds: 120,
      finish_type: "win_small",
    },
  },
  {
    multiplier: 1.5,
    probability: 0.05,
    visual: {
      barriers_crossed: 57,
      balls_count: 14,
      score_target: 128,
      duration_seconds: 140,
      finish_type: "win_good",
    },
  },
  {
    multiplier: 2,
    probability: 0.04,
    visual: {
      barriers_crossed: 67,
      balls_count: 16,
      score_target: 155,
      duration_seconds: 160,
      finish_type: "win_medium",
    },
  },
  {
    multiplier: 3,
    probability: 0.025,
    visual: {
      barriers_crossed: 77,
      balls_count: 18,
      score_target: 195,
      duration_seconds: 190,
      finish_type: "win_special",
    },
  },
  {
    multiplier: 5,
    probability: 0.015,
    visual: {
      barriers_crossed: 87,
      balls_count: 22,
      score_target: 250,
      duration_seconds: 220,
      finish_type: "win_large",
    },
  },
  {
    multiplier: 10,
    probability: 0.008,
    visual: {
      barriers_crossed: 97,
      balls_count: 26,
      score_target: 380,
      duration_seconds: 260,
      finish_type: "super_round",
    },
  },
  {
    multiplier: 20,
    probability: 0.002,
    visual: {
      barriers_crossed: 100,
      balls_count: 28,
      score_target: 520,
      duration_seconds: 290,
      finish_type: "meta_max",
    },
  },
];

export function totalProbabilityMass(): number {
  return MULTIPLIER_TIERS.reduce((s, t) => s + t.probability, 0);
}

export function theoreticalRtp(): number {
  return MULTIPLIER_TIERS.reduce((s, t) => s + t.probability * t.multiplier, 0);
}

/** RNG uniforme em [0, 1). */
export function sampleMultiplier(rng: () => number): number {
  let r = rng();
  if (!Number.isFinite(r) || r < 0) r = 0;
  if (r >= 1) r = 1 - Number.EPSILON;
  let cum = 0;
  for (const tier of MULTIPLIER_TIERS) {
    cum += tier.probability;
    if (r < cum) return tier.multiplier;
  }
  return MULTIPLIER_TIERS[MULTIPLIER_TIERS.length - 1]!.multiplier;
}

export function buildVisualResult(multiplier: number): VisualResult {
  const tier =
    MULTIPLIER_TIERS.find((t) => Math.abs(t.multiplier - multiplier) < 1e-9) ??
    MULTIPLIER_TIERS[0]!;
  return { ...tier.visual };
}

export type RoundScript = VisualResult;
