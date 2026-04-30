import { calculateZones, getZoneForMultiplier } from "./economy/zoneCalculator";

export interface ClimbStep {
  barrierIndex: number;
  multiplierAtStep: number;
  zoneIndex: number;
  timeOffset: number;
  isFinal?: boolean;
}

export function calculateClimbTrajectory(
  finalMultiplier: number,
  durationSeconds: number,
  targetBarrier: number,
): ClimbStep[] {
  const zones = calculateZones();
  const barriers = Math.max(1, targetBarrier);
  const steps: ClimbStep[] = [];
  for (let i = 0; i < barriers; i++) {
    const progress = (i + 1) / barriers;
    const m = Math.max(0, Math.min(finalMultiplier, finalMultiplier * progress));
    const z = getZoneForMultiplier(m, zones);
    steps.push({
      barrierIndex: i + 1,
      multiplierAtStep: m,
      zoneIndex: z.index,
      timeOffset: durationSeconds * progress,
      isFinal: i === barriers - 1,
    });
  }
  return steps;
}

export function multiplierForBarrier(
  barriersPassed: number,
  finalMultiplier: number,
  targetBarrier: number,
): number {
  const safeTarget = Math.max(1, targetBarrier);
  const progress = Math.min(1, Math.max(0, barriersPassed / safeTarget));
  return Math.min(finalMultiplier, finalMultiplier * progress);
}
