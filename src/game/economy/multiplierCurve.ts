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
 * ESCALA ESTENDIDA (200 barreiras):
 *   A curva foi esticada ~3,3× no eixo X — agora vai de 0 a 200 barreiras
 *   (antes 0 a 60). Mesma forma e mesmo teto ×50.
 *
 * Espelhado em supabase/functions/_shared/multiplierCurve.ts e na função SQL
 * `compute_multiplier_for_barrier`. Qualquer mudança deve ser aplicada nos três.
 */

export const MULTIPLIER_CURVE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [7, 0],
  [17, 0.5],
  [27, 0.8],
  [37, 1.0],
  [47, 1.2],
  [57, 1.5],
  [67, 2.0],
  [77, 3.0],
  [87, 5.0],
  [97, 10.0],
  [100, 20.0],
  // ↓ Cauda pós-alvo (Fase 2) — escala estendida
  [110, 26.0],
  [127, 32.0],
  [150, 40.0],
  [200, 50.0],
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
