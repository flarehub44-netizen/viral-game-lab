// ============================================================================
// Conquistas — checadas ao final de cada run. Persistência em localStorage.
// ============================================================================

import type { RunSummary } from "./missions";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Retorna true se a run satisfaz a condição (ou stats lifetime). */
  check: (run: RunSummary, lifetime: { runs: number; bestScore: number; bossesKilled: number; merges: number }) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_blood",
    name: "Primeira run",
    description: "Jogue pela primeira vez",
    icon: "🎯",
    check: (_r, l) => l.runs >= 1,
  },
  {
    id: "score_1k",
    name: "Mil pontos",
    description: "Faça 1.000 pontos numa run",
    icon: "💯",
    check: (r) => r.score >= 1000,
  },
  {
    id: "score_5k",
    name: "Cinco mil",
    description: "Faça 5.000 pontos numa run",
    icon: "🔥",
    check: (r) => r.score >= 5000,
  },
  {
    id: "score_20k",
    name: "Lendário",
    description: "Faça 20.000 pontos numa run",
    icon: "👑",
    check: (r) => r.score >= 20000,
  },
  {
    id: "mult_8",
    name: "Multiplica!",
    description: "Atinja ×8 bolinhas vivas",
    icon: "✨",
    check: (r) => r.maxMultiplier >= 8,
  },
  {
    id: "mult_16",
    name: "Enxame",
    description: "Atinja ×16 bolinhas vivas",
    icon: "🌌",
    check: (r) => r.maxMultiplier >= 16,
  },
  {
    id: "perfect_10",
    name: "Mãos firmes",
    description: "10 passes perfeitos seguidos",
    icon: "🎯",
    check: (r) => r.bestPerfectStreak >= 10,
  },
  {
    id: "near_5",
    name: "Quase!",
    description: "5 near-misses numa run",
    icon: "⚡",
    check: (r) => r.nearMisses >= 5,
  },
  {
    id: "purist",
    name: "Purista",
    description: "Sobreviva 60s sem pegar power-up",
    icon: "🧘",
    check: (r) => r.durationSeconds >= 60 && !r.pickedAnyPowerup,
  },
  {
    id: "boss_slayer",
    name: "Caçador de boss",
    description: "Derrote o primeiro boss",
    icon: "💀",
    check: (_r, l) => l.bossesKilled >= 1,
  },
  {
    id: "boss_5",
    name: "Mata-boss",
    description: "Derrote 5 bosses no total",
    icon: "🗡️",
    check: (_r, l) => l.bossesKilled >= 5,
  },
  {
    id: "merger",
    name: "Fusão",
    description: "Use o merge (tap duplo) pela primeira vez",
    icon: "🟡",
    check: (_r, l) => l.merges >= 1,
  },
  {
    id: "veteran",
    name: "Veterano",
    description: "Jogue 50 runs",
    icon: "🎖️",
    check: (_r, l) => l.runs >= 50,
  },
];

const UNLOCKED_KEY = "ns_achievements";
const LIFETIME_KEY = "ns_achievement_lifetime";

interface LifetimeStats {
  runs: number;
  bestScore: number;
  bossesKilled: number;
  merges: number;
}

function getLifetime(): LifetimeStats {
  try {
    const raw = localStorage.getItem(LIFETIME_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { runs: 0, bestScore: 0, bossesKilled: 0, merges: 0 };
}

function saveLifetime(s: LifetimeStats) {
  try {
    localStorage.setItem(LIFETIME_KEY, JSON.stringify(s));
  } catch {}
}

export function getUnlockedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(UNLOCKED_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveUnlocked(set: Set<string>) {
  try {
    localStorage.setItem(UNLOCKED_KEY, JSON.stringify([...set]));
  } catch {}
}

export interface RunExtras {
  bossesKilled: number;
  mergesUsed: number;
}

/** Aplica a run, atualiza lifetime e retorna conquistas recém-desbloqueadas. */
export function applyRun(run: RunSummary, extras: RunExtras): Achievement[] {
  const lifetime = getLifetime();
  lifetime.runs += 1;
  lifetime.bestScore = Math.max(lifetime.bestScore, run.score);
  lifetime.bossesKilled += extras.bossesKilled;
  lifetime.merges += extras.mergesUsed;
  saveLifetime(lifetime);

  const unlocked = getUnlockedIds();
  const newly: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (unlocked.has(a.id)) continue;
    if (a.check(run, lifetime)) {
      unlocked.add(a.id);
      newly.push(a);
    }
  }
  saveUnlocked(unlocked);
  return newly;
}

export function getAllWithStatus(): Array<Achievement & { unlocked: boolean }> {
  const unlocked = getUnlockedIds();
  return ACHIEVEMENTS.map((a) => ({ ...a, unlocked: unlocked.has(a.id) }));
}
