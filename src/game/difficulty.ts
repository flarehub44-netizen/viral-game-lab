export interface DifficultySnapshot {
  value: number;
  barrierSpawnEverySec: number;
}

export function getDifficultySnapshot(elapsedMs: number): DifficultySnapshot {
  const t = elapsedMs / 1000;
  const cycle = 25;
  const within = t % cycle;
  const cycleNum = Math.floor(t / cycle);
  const baseRamp = Math.min(0.85, t / 160);
  const wavePhase = within < 20 ? within / 20 : 1 - (within - 20) / 5 * 0.35;
  const value = Math.min(0.92, baseRamp * 0.6 + wavePhase * 0.35 + cycleNum * 0.02);
  return {
    value,
    barrierSpawnEverySec: 1.5 - value * 0.7,
  };
}
