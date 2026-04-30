// ============================================================================
// XP / Level — progressão persistente em localStorage.
// XP ganho = score / 10 (rounded). Curva: level N requer 100 * N^1.4 XP.
// ============================================================================

const XP_KEY = "ns_xp";

export interface LevelInfo {
  level: number;
  xp: number;
  xpInLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
}

function xpRequiredForLevel(level: number): number {
  // total XP necessário pra atingir o nível `level` (level 1 = 0 XP)
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.4));
}

function levelFromXp(xp: number): number {
  let lv = 1;
  while (xpRequiredForLevel(lv + 1) <= xp) lv++;
  return lv;
}

export function getXp(): number {
  try {
    return Number(localStorage.getItem(XP_KEY) || 0);
  } catch {
    return 0;
  }
}

export function getLevelInfo(): LevelInfo {
  const xp = getXp();
  const level = levelFromXp(xp);
  const base = xpRequiredForLevel(level);
  const next = xpRequiredForLevel(level + 1);
  const xpInLevel = xp - base;
  const xpForNextLevel = next - base;
  return {
    level,
    xp,
    xpInLevel,
    xpForNextLevel,
    progress: xpForNextLevel > 0 ? xpInLevel / xpForNextLevel : 0,
  };
}

/** Adiciona XP a partir de um score. Retorna info nova + level anterior pra detectar level-up. */
export function addXpFromScore(score: number): { info: LevelInfo; leveledUp: boolean; previousLevel: number } {
  const previousLevel = getLevelInfo().level;
  const gain = Math.max(0, Math.floor(score / 10));
  const next = getXp() + gain;
  try {
    localStorage.setItem(XP_KEY, String(next));
  } catch {}
  const info = getLevelInfo();
  return { info, leveledUp: info.level > previousLevel, previousLevel };
}
