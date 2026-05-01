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

/**
 * Layout calibrado por distância ao alvo (LIVE):
 * faz a maior parte dos jogadores morrer estatisticamente próximo
 * ao `targetBarrier`, alimentando o RTP da tabela teórica.
 */
export function generateDeterministicLayout(
  layoutSeed: string,
  targetBarrier: number,
  count = 50,
): LayoutBarrier[] {
  const rng = mulberry32(hashSeed(layoutSeed));
  const rows: LayoutBarrier[] = [];
  for (let i = 0; i < count; i++) {
    const distanceToTarget = targetBarrier - i;
    let gapSize: number;
    let difficulty: ZoneDifficulty;

    if (distanceToTarget > 10) {
      gapSize = 0.35 + rng() * 0.10;
      difficulty = "easy";
    } else if (distanceToTarget > 5) {
      gapSize = 0.22 + rng() * 0.10;
      difficulty = "medium";
    } else if (distanceToTarget > 2) {
      gapSize = 0.15 + rng() * 0.05;
      difficulty = "hard";
    } else if (distanceToTarget > 0) {
      gapSize = 0.08 + rng() * 0.04;
      difficulty = "very_hard";
    } else {
      gapSize = 0.04 + rng() * 0.03;
      difficulty = "extreme";
    }

    const margin = Math.max(0, 1 - gapSize);
    rows.push({
      index: i,
      difficulty,
      gapSize,
      gapPosition: rng() * margin,
      speed: 80 + Math.min(100, i * 2.0),
    });
  }
  return rows;
}
