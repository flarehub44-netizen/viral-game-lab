/**
 * ESPELHO de src/game/economy/multiplierCurve.ts — manter sincronizado.
 * Função pública e auditável: multiplicador como função do número de barreiras.
 */

export const MULTIPLIER_CURVE_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [2, 0],
  [5, 0.5],
  [8, 0.8],
  [11, 1.0],
  [14, 1.2],
  [17, 1.5],
  [20, 2.0],
  [23, 3.0],
  [26, 5.0],
  [29, 10.0],
  [30, 20.0],
  // Cauda pós-alvo (Fase 2) — achatada para reduzir RTP empírico (~70%).
  [33, 22.0],
  [38, 25.0],
  [45, 28.0],
  [60, 30.0],
] as const;

export const MULTIPLIER_CURVE_HARD_CAP = 30;

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
