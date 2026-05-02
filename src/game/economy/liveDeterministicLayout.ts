import type { ZoneDifficulty } from "./zoneCalculator";

export interface LayoutBarrier {
  index: number;
  gapSize: number;
  gapPosition: number;
  speed: number;
  difficulty: ZoneDifficulty;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Parâmetros da escalada pós-alvo (Fase 2 — perfil "Médio"):
 * a cada barreira além do alvo o gap encolhe e a velocidade aumenta.
 */
export const PHASE2_GAP_DECAY = 0.86;       // gap *= 0.86^extra (mais agressivo que antes)
export const PHASE2_SPEED_STEP = 22;        // +22 px/s por barreira extra
export const PHASE2_GAP_FLOOR = 0.02;       // piso de gap (impossibilidade absoluta)
export const PHASE2_SPEED_CEIL = 320;       // teto de velocidade

/**
 * Layout calibrado por distância ao alvo (LIVE):
 * - Pré-alvo: faz a maior parte dos jogadores morrer estatisticamente próximo
 *   ao `targetBarrier`, alimentando o RTP da tabela teórica.
 * - Pós-alvo (Fase 2): escalada contínua de dificuldade — sem cap forçado.
 *   O round só termina quando todas as bolas morrerem.
 */
export function generateDeterministicLayout(
  layoutSeed: string,
  targetBarrier: number,
  count = 80,
): LayoutBarrier[] {
  const rng = mulberry32(hashSeed(layoutSeed));
  const rows: LayoutBarrier[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(buildLayoutRow(i, targetBarrier, rng));
  }
  return rows;
}

/**
 * Gera uma linha de layout. Exposto para o engine continuar gerando barreiras
 * proceduralmente caso o jogador exceda `count` (continuidade infinita).
 */
export function buildLayoutRow(
  index: number,
  targetBarrier: number,
  rng: () => number,
): LayoutBarrier {
  const distanceToTarget = targetBarrier - index;
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

  let speed = 80 + Math.min(100, index * 2.0);

  // Fase 2: escalada pós-alvo (sutil — sem aviso visual).
  if (distanceToTarget < 0) {
    const extra = -distanceToTarget; // 1, 2, 3, ...
    gapSize = Math.max(PHASE2_GAP_FLOOR, gapSize * Math.pow(PHASE2_GAP_DECAY, extra));
    speed = Math.min(PHASE2_SPEED_CEIL, speed + PHASE2_SPEED_STEP * extra);
  }

  const margin = Math.max(0, 1 - gapSize);
  return {
    index,
    difficulty,
    gapSize,
    gapPosition: rng() * margin,
    speed,
  };
}
