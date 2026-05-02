/**
 * Curva pública e auditável: multiplicador como função do número de barreiras passadas.
 *
 * MODELO (Fase 1):
 *   - Servidor sorteia um tier via MULTIPLIER_TIERS (RTP teórico 85,7% preservado).
 *   - Cada tier define um `target_barrier` — o alvo estatístico de morte.
 *   - O layout determinístico calibra a dificuldade para que o jogador médio morra
 *     em torno desse alvo.
 *   - O payout é SEMPRE `stake × m(barriers_passed)`, onde `m` é a curva abaixo.
 *
 * IMPORTANTE: a curva é interpolação linear entre as âncoras (target_barrier, tier_mult)
 * extraídas da MULTIPLIER_TIERS. Isso garante que `m(target_do_tier_X) === tier_X.multiplier`,
 * o que mantém o RTP teórico exato quando o jogador morre exatamente no alvo do tier sorteado.
 *
 * Espelhado em supabase/functions/_shared/multiplierCurve.ts — qualquer mudança deve ser
 * aplicada nos DOIS arquivos (e na função SQL `compute_multiplier_for_barrier`).
 */

/**
 * Âncoras (barreira, multiplicador). Devem casar com MULTIPLIER_TIERS até [20, 20].
 *
 * FASE 2 — Cauda pós-tier-máximo (b > 20):
 *   Crescimento côncavo (sub-linear) que recompensa skill sem explodir o RTP.
 *   Cada barreira extra acima do alvo do tier também enfrenta um layout mais
 *   difícil (ver `liveDeterministicLayout`), então a probabilidade de chegar
 *   nessas âncoras cai rápido — a cauda contribui ~6–8% do RTP no perfil "skilled".
 *   `MAX_PAYOUT` continua sendo o teto absoluto por rodada no settle.
 */
export const MULTIPLIER_CURVE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [3, 0.5],
  [5, 0.8],
  [7, 1.0],
  [9, 1.2],
  [11, 1.5],
  [13, 2.0],
  [15, 3.0],
  [17, 5.0],
  [19, 10.0],
  [20, 20.0],
  // ↓ Cauda pós-alvo (Fase 2)
  [22, 26.0],
  [25, 32.0],
  [30, 40.0],
  [40, 50.0],
] as const;

/** Cap absoluto da curva — `MAX_PAYOUT` continua limitando o payout final por stake. */
export const MULTIPLIER_CURVE_HARD_CAP = 50;

/**
 * Multiplicador por barreira (interpolação linear entre âncoras).
 * Para `b < 0` retorna 0; para `b ≥ última âncora` satura no cap.
 */
export function multiplierForBarriers(barriersPassed: number): number {
  if (!Number.isFinite(barriersPassed) || barriersPassed <= 0) return 0;
  const b = barriersPassed;
  const anchors = MULTIPLIER_CURVE_ANCHORS;
  if (b >= anchors[anchors.length - 1]![0]) return MULTIPLIER_CURVE_HARD_CAP;

  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i]!;
    const [x1, y1] = anchors[i + 1]!;
    if (b >= x0 && b <= x1) {
      if (x1 === x0) return Math.min(MULTIPLIER_CURVE_HARD_CAP, y1);
      const t = (b - x0) / (x1 - x0);
      const y = y0 + (y1 - y0) * t;
      return Math.min(MULTIPLIER_CURVE_HARD_CAP, Math.max(0, Math.round(y * 100) / 100));
    }
  }
  return 0;
}

/** Configuração do round entregue pelo servidor para o engine. */
export interface RoundConfig {
  layoutSeed: string;
  layoutSignature: string;
  /** Alvo estatístico de morte — usado pelo layout para calibrar dificuldade. */
  deathTargetBarrier: number;
  /** Tier sorteado (referência teórica para HUD/UX). */
  tierMultiplier: number;
  /** Pagamento máximo absoluto da rodada. */
  maxPayout: number;
}
