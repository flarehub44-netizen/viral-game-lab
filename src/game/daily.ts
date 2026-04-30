// ============================================================================
// Daily Challenge — seed determinística por data, modificadores fixos do dia.
// ============================================================================

export interface DailyMod {
  speedMultiplier: number;
  gapMultiplier: number;
  scoreMultiplier: number;
  label: string;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDailyDateKey(): string {
  return todayKey();
}

export function getDailySeed(): number {
  return hash("daily-" + todayKey());
}

const VARIANTS: DailyMod[] = [
  { speedMultiplier: 1.2, gapMultiplier: 1.0, scoreMultiplier: 1.5, label: "Velocidade x1.2 · Pontos x1.5" },
  { speedMultiplier: 1.0, gapMultiplier: 0.8, scoreMultiplier: 2.0, label: "Gaps menores · Pontos x2" },
  { speedMultiplier: 1.4, gapMultiplier: 1.1, scoreMultiplier: 2.0, label: "Velocidade x1.4 · Pontos x2" },
  { speedMultiplier: 1.0, gapMultiplier: 1.2, scoreMultiplier: 1.2, label: "Modo zen · Gaps maiores" },
  { speedMultiplier: 1.6, gapMultiplier: 1.0, scoreMultiplier: 3.0, label: "Hardcore · Pontos x3" },
];

export function getDailyMod(): DailyMod {
  return VARIANTS[getDailySeed() % VARIANTS.length];
}

const PLAYED_KEY = "ns_daily_played";

export function hasPlayedToday(): boolean {
  try {
    return localStorage.getItem(PLAYED_KEY) === todayKey();
  } catch {
    return false;
  }
}

export function markPlayedToday() {
  try {
    localStorage.setItem(PLAYED_KEY, todayKey());
  } catch {}
}

const LOCAL_BEST_KEY = "ns_daily_best_";

export function getLocalBest(): number {
  try {
    return Number(localStorage.getItem(LOCAL_BEST_KEY + todayKey()) || 0);
  } catch {
    return 0;
  }
}

export function setLocalBest(score: number) {
  try {
    const cur = getLocalBest();
    if (score > cur) localStorage.setItem(LOCAL_BEST_KEY + todayKey(), String(score));
  } catch {}
}
