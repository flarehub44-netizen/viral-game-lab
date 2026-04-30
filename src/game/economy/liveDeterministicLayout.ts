import type { ZoneDifficulty } from "./zoneCalculator";

export interface LayoutBarrier {
  index: number;
  gapSize: number;
  gapPosition: number;
  speed: number;
  difficulty: ZoneDifficulty;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function gapForDifficulty(d: ZoneDifficulty, rng: () => number): number {
  switch (d) {
    case "easy":
      return 0.35 + rng() * 0.1;
    case "medium":
      return 0.24 + rng() * 0.08;
    case "hard":
      return 0.16 + rng() * 0.06;
    case "very_hard":
      return 0.1 + rng() * 0.04;
    default:
      return 0.06 + rng() * 0.03;
  }
}

export function generateDeterministicLayout(
  layoutSeed: string,
  targetBarrier: number,
  count = 50,
): LayoutBarrier[] {
  const rng = mulberry32(hashSeed(layoutSeed));
  const rows: LayoutBarrier[] = [];
  for (let i = 0; i < count; i++) {
    const d: ZoneDifficulty =
      i < targetBarrier - 5
        ? "easy"
        : i < targetBarrier - 2
          ? "medium"
          : i < targetBarrier
            ? "hard"
            : i === targetBarrier
              ? "very_hard"
              : "extreme";
    const gapSize = gapForDifficulty(d, rng);
    const margin = Math.max(0, 1 - gapSize);
    rows.push({
      index: i,
      difficulty: d,
      gapSize,
      gapPosition: rng() * margin,
      speed: 90 + Math.min(120, i * 2.2),
    });
  }
  return rows;
}
