/**
 * ESPELHO de src/game/economy/multiplierCurve.ts — manter sincronizado.
 * Curva estendida (0 → 200 barreiras), teto ×50.
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
  // Cauda pós-alvo (Fase 2) — escala estendida
  [110, 26.0],
  [127, 32.0],
  [150, 40.0],
  [200, 50.0],
] as const;

export const MULTIPLIER_CURVE_HARD_CAP = 50;

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
