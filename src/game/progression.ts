// Progression: XP, level, daily missions, achievements. All localStorage.

export interface RoundSummary {
  score: number;
  durationSeconds: number;
  maxCombo: number;
  maxAlive: number;
  splits: number;
  powerupsCollected: number;
}

export interface MissionDef {
  id: string;
  label: string;
  goal: number;
  xp: number;
  measure: (r: RoundSummary, prevTotals: Totals) => number; // current progress for this round
}

export interface MissionState {
  id: string;
  label: string;
  goal: number;
  xp: number;
  progress: number;
  done: boolean;
}

export interface AchievementDef {
  id: string;
  label: string;
  description: string;
  check: (r: RoundSummary, totals: Totals) => boolean;
}

export interface Totals {
  totalScore: number;
  totalSeconds: number;
  totalRounds: number;
  totalSplits: number;
  bestCombo: number;
  bestAlive: number;
}

interface ProgressionData {
  xp: number;
  totals: Totals;
  missions: { date: string; list: MissionState[] };
  achievements: string[]; // unlocked ids
}

const KEY = "ns_prog_v1";

const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_split", label: "Primeira Divisão", description: "Faça seu primeiro split", check: (_, t) => t.totalSplits >= 1 },
  { id: "ten_alive", label: "Enxame", description: "Tenha 10 bolinhas vivas ao mesmo tempo", check: (_, t) => t.bestAlive >= 10 },
  { id: "fifty_alive", label: "Tempestade", description: "50 bolinhas vivas ao mesmo tempo", check: (_, t) => t.bestAlive >= 50 },
  { id: "combo_10", label: "No Ritmo", description: "Atinja combo x10", check: (_, t) => t.bestCombo >= 10 },
  { id: "combo_25", label: "Em Chamas", description: "Atinja combo x25", check: (_, t) => t.bestCombo >= 25 },
  { id: "score_100", label: "Centenário", description: "100 pontos numa rodada", check: (r) => r.score >= 100 },
  { id: "score_500", label: "Mestre Neon", description: "500 pontos numa rodada", check: (r) => r.score >= 500 },
  { id: "survive_60", label: "Persistente", description: "Sobreviva 60 segundos", check: (r) => r.durationSeconds >= 60 },
  { id: "survive_120", label: "Maratonista", description: "Sobreviva 2 minutos", check: (r) => r.durationSeconds >= 120 },
  { id: "rounds_10", label: "Viciado", description: "Jogue 10 rodadas", check: (_, t) => t.totalRounds >= 10 },
];

const MISSION_POOL: MissionDef[] = [
  { id: "score_50", label: "Faça 50 pontos numa rodada", goal: 50, xp: 30, measure: (r) => Math.min(r.score, 50) },
  { id: "score_150", label: "Faça 150 pontos numa rodada", goal: 150, xp: 60, measure: (r) => Math.min(r.score, 150) },
  { id: "combo_8", label: "Chegue a combo x8", goal: 8, xp: 40, measure: (r) => Math.min(r.maxCombo, 8) },
  { id: "combo_15", label: "Chegue a combo x15", goal: 15, xp: 70, measure: (r) => Math.min(r.maxCombo, 15) },
  { id: "alive_15", label: "Tenha 15 bolinhas vivas", goal: 15, xp: 35, measure: (r) => Math.min(r.maxAlive, 15) },
  { id: "alive_30", label: "Tenha 30 bolinhas vivas", goal: 30, xp: 60, measure: (r) => Math.min(r.maxAlive, 30) },
  { id: "survive_45", label: "Sobreviva 45 segundos", goal: 45, xp: 40, measure: (r) => Math.min(r.durationSeconds, 45) },
  { id: "splits_20", label: "Faça 20 splits", goal: 20, xp: 30, measure: (r) => Math.min(r.splits, 20) },
  { id: "powerups_3", label: "Pegue 3 power-ups", goal: 3, xp: 50, measure: (r) => Math.min(r.powerupsCollected, 3) },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function pickDailyMissions(): MissionState[] {
  // Deterministic per-day pick
  const seed = todayStr().split("-").reduce((a, b) => a + Number(b), 0);
  const shuffled = [...MISSION_POOL].sort((a, b) => {
    const ha = (a.id.charCodeAt(0) + seed) % 97;
    const hb = (b.id.charCodeAt(0) + seed) % 97;
    return ha - hb;
  });
  return shuffled.slice(0, 3).map((m) => ({
    id: m.id,
    label: m.label,
    goal: m.goal,
    xp: m.xp,
    progress: 0,
    done: false,
  }));
}

function defaultData(): ProgressionData {
  return {
    xp: 0,
    totals: { totalScore: 0, totalSeconds: 0, totalRounds: 0, totalSplits: 0, bestCombo: 0, bestAlive: 0 },
    missions: { date: todayStr(), list: pickDailyMissions() },
    achievements: [],
  };
}

export function loadProgression(): ProgressionData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const data = JSON.parse(raw) as ProgressionData;
    // Reset missions if new day
    if (data.missions?.date !== todayStr()) {
      data.missions = { date: todayStr(), list: pickDailyMissions() };
      saveProgression(data);
    }
    return data;
  } catch {
    return defaultData();
  }
}

export function saveProgression(data: ProgressionData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

// Level curve: level n requires n*100 XP cumulative per level (i.e. 100, 200, 300...)
export function levelFromXp(xp: number): { level: number; intoLevel: number; needed: number; progress: number } {
  let level = 1;
  let remaining = xp;
  let needed = 100;
  while (remaining >= needed) {
    remaining -= needed;
    level++;
    needed = level * 100;
  }
  return { level, intoLevel: remaining, needed, progress: remaining / needed };
}

export interface RoundResult {
  xpGained: number;
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  missionsCompleted: MissionState[];
  achievementsUnlocked: AchievementDef[];
  data: ProgressionData;
}

export function applyRound(round: RoundSummary): RoundResult {
  const data = loadProgression();
  const xpBefore = data.xp;
  const levelBefore = levelFromXp(xpBefore).level;

  // XP from round
  const baseXp = round.score;
  const comboBonus = Math.floor(round.maxCombo * 2);
  const timeBonus = Math.floor(round.durationSeconds * 0.5);
  let xpGained = baseXp + comboBonus + timeBonus;

  // Update totals BEFORE checking achievements
  data.totals.totalScore += round.score;
  data.totals.totalSeconds += round.durationSeconds;
  data.totals.totalRounds += 1;
  data.totals.totalSplits += round.splits;
  data.totals.bestCombo = Math.max(data.totals.bestCombo, round.maxCombo);
  data.totals.bestAlive = Math.max(data.totals.bestAlive, round.maxAlive);

  // Missions
  const missionsCompleted: MissionState[] = [];
  for (const m of data.missions.list) {
    if (m.done) continue;
    const def = MISSION_POOL.find((p) => p.id === m.id);
    if (!def) continue;
    const progress = Math.max(m.progress, def.measure(round, data.totals));
    m.progress = progress;
    if (progress >= m.goal) {
      m.done = true;
      xpGained += m.xp;
      missionsCompleted.push({ ...m });
    }
  }

  // Achievements
  const unlocked: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (data.achievements.includes(a.id)) continue;
    if (a.check(round, data.totals)) {
      data.achievements.push(a.id);
      unlocked.push(a);
      xpGained += 25; // bonus per achievement
    }
  }

  data.xp = xpBefore + xpGained;
  const levelAfter = levelFromXp(data.xp).level;

  saveProgression(data);

  return {
    xpGained,
    xpBefore,
    xpAfter: data.xp,
    levelBefore,
    levelAfter,
    missionsCompleted,
    achievementsUnlocked: unlocked,
    data,
  };
}

export function getAllAchievements(): AchievementDef[] {
  return ACHIEVEMENTS;
}
