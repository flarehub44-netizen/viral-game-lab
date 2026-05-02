/**
 * Tabela oficial — perfil "casino" (RTP teórico ≈ 53%).
 * RTP empírico esperado (com curva pós-alvo achatada e dificuldade Fase 2 mais agressiva): ~70%.
 * Espelhado em supabase/functions/_shared/multiplierTable.ts para a Edge Function.
 *
 * Histórico: a tabela anterior tinha RTP teórico ~85,7% e empírico ~78%. Os tiers
 * altos (×3, ×5, ×10, ×20) foram drasticamente reduzidos para que multiplicadores
 * grandes virem eventos raros de verdade.
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
    probability: 0.379,
    visual: {
      barriers_crossed: 2,
      balls_count: 3,
      score_target: 18,
      duration_seconds: 9,
      finish_type: "lose_early",
    },
  },
  {
    multiplier: 0.5,
    probability: 0.25,
    visual: {
      barriers_crossed: 5,
      balls_count: 5,
      score_target: 42,
      duration_seconds: 18,
      finish_type: "recover_partial",
    },
  },
  {
    multiplier: 0.8,
    probability: 0.17,
    visual: {
      barriers_crossed: 8,
      balls_count: 8,
      score_target: 68,
      duration_seconds: 24,
      finish_type: "almost_even",
    },
  },
  {
    multiplier: 1,
    probability: 0.09,
    visual: {
      barriers_crossed: 11,
      balls_count: 10,
      score_target: 88,
      duration_seconds: 30,
      finish_type: "break_even",
    },
  },
  {
    multiplier: 1.2,
    probability: 0.055,
    visual: {
      barriers_crossed: 14,
      balls_count: 12,
      score_target: 105,
      duration_seconds: 36,
      finish_type: "win_small",
    },
  },
  {
    multiplier: 1.5,
    probability: 0.03,
    visual: {
      barriers_crossed: 17,
      balls_count: 14,
      score_target: 128,
      duration_seconds: 42,
      finish_type: "win_good",
    },
  },
  {
    multiplier: 2,
    probability: 0.015,
    visual: {
      barriers_crossed: 20,
      balls_count: 16,
      score_target: 155,
      duration_seconds: 48,
      finish_type: "win_medium",
    },
  },
  {
    multiplier: 3,
    probability: 0.007,
    visual: {
      barriers_crossed: 23,
      balls_count: 18,
      score_target: 195,
      duration_seconds: 57,
      finish_type: "win_special",
    },
  },
  {
    multiplier: 5,
    probability: 0.003,
    visual: {
      barriers_crossed: 26,
      balls_count: 22,
      score_target: 250,
      duration_seconds: 68,
      finish_type: "win_large",
    },
  },
  {
    multiplier: 10,
    probability: 0.0008,
    visual: {
      barriers_crossed: 29,
      balls_count: 26,
      score_target: 380,
      duration_seconds: 78,
      finish_type: "super_round",
    },
  },
  {
    multiplier: 20,
    probability: 0.0002,
    visual: {
      barriers_crossed: 30,
      balls_count: 28,
      score_target: 520,
      duration_seconds: 87,
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
