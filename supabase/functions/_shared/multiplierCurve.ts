/**
 * ESPELHO de src/game/economy/multiplierCurve.ts — manter sincronizado.
 * Função pública e auditável: multiplicador como função do número de barreiras.
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
] as const;

export const MULTIPLIER_CURVE_HARD_CAP = 20;

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
