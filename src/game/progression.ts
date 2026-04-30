// Progression: XP, level, daily missions, achievements. All localStorage.

export interface RoundSummary {
  score: number;
  durationSeconds: number;
  maxCombo: number;
  maxAlive: number;
  splits: number;
  powerupsCollected: number;
  barriersPassed?: number;
  finalMultiplier?: number;
  finalZone?: number;
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
  credits: number;
  totals: Totals;
  missions: { date: string; list: MissionState[] };
  achievements: string[]; // unlocked ids
  goalsCompleted: number;
  streak: number;
  lastPlayDate: string;
  climb: {
    bestMultiplier: number;
    bestZone: number;
    totalBarriersPassed: number;
    zonesReachedCount: number;
  };
}

const KEYS = {
  default: "ns_prog_v1",
  demo: "ns_prog_demo_v1",
} as const;

export type ProgressionProfile = keyof typeof KEYS;

export function progressionStorageKey(profile: ProgressionProfile = "default"): string {
  return KEYS[profile];
}
const DAILY_MISSIONS_COUNT = 3;
const GOAL_REWARD_CREDITS = 20;

export interface RunGoalDef {
  id: string;
  label: string;
  rewardCredits: number;
  check: (r: RoundSummary) => boolean;
}

export interface RunGoalResult {
  id: string;
  label: string;
  rewardCredits: number;
}

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
  { id: "score_50",    label: "Faça 50 pontos numa rodada",   goal: 50,  xp: 30, measure: (r) => Math.min(r.score, 50) },
  { id: "score_150",   label: "Faça 150 pontos numa rodada",  goal: 150, xp: 60, measure: (r) => Math.min(r.score, 150) },
  { id: "combo_8",     label: "Chegue a combo x8",            goal: 8,   xp: 40, measure: (r) => Math.min(r.maxCombo, 8) },
  { id: "combo_15",    label: "Chegue a combo x15",           goal: 15,  xp: 70, measure: (r) => Math.min(r.maxCombo, 15) },
  { id: "alive_15",    label: "Tenha 15 bolinhas vivas",      goal: 15,  xp: 35, measure: (r) => Math.min(r.maxAlive, 15) },
  { id: "alive_30",    label: "Tenha 30 bolinhas vivas",      goal: 30,  xp: 60, measure: (r) => Math.min(r.maxAlive, 30) },
  { id: "survive_45",  label: "Sobreviva 45 segundos",        goal: 45,  xp: 40, measure: (r) => Math.min(r.durationSeconds, 45) },
  { id: "splits_20",   label: "Faça 20 splits",               goal: 20,  xp: 30, measure: (r) => Math.min(r.splits, 20) },
  { id: "powerups_3",  label: "Pegue 3 power-ups",            goal: 3,   xp: 50, measure: (r) => Math.min(r.powerupsCollected, 3) },
  // Pool expandido — reduz repetição de 3 para 6 dias
  { id: "score_75",    label: "Faça 75 pontos numa rodada",   goal: 75,  xp: 35, measure: (r) => Math.min(r.score, 75) },
  { id: "score_250",   label: "Faça 250 pontos numa rodada",  goal: 250, xp: 80, measure: (r) => Math.min(r.score, 250) },
  { id: "combo_5",     label: "Chegue a combo x5",            goal: 5,   xp: 25, measure: (r) => Math.min(r.maxCombo, 5) },
  { id: "combo_20",    label: "Chegue a combo x20",           goal: 20,  xp: 80, measure: (r) => Math.min(r.maxCombo, 20) },
  { id: "alive_8",     label: "Tenha 8 bolinhas vivas",       goal: 8,   xp: 25, measure: (r) => Math.min(r.maxAlive, 8) },
  { id: "alive_50",    label: "Tenha 50 bolinhas vivas",      goal: 50,  xp: 75, measure: (r) => Math.min(r.maxAlive, 50) },
  { id: "survive_30",  label: "Sobreviva 30 segundos",        goal: 30,  xp: 25, measure: (r) => Math.min(r.durationSeconds, 30) },
  { id: "survive_90",  label: "Sobreviva 90 segundos",        goal: 90,  xp: 65, measure: (r) => Math.min(r.durationSeconds, 90) },
  { id: "splits_40",   label: "Faça 40 splits numa rodada",   goal: 40,  xp: 45, measure: (r) => Math.min(r.splits, 40) },
];

const RUN_GOALS: RunGoalDef[] = [
  { id: "run_score_120", label: "Faça 120 pontos na rodada", rewardCredits: GOAL_REWARD_CREDITS, check: (r) => r.score >= 120 },
  { id: "run_combo_12", label: "Atinja combo x12", rewardCredits: GOAL_REWARD_CREDITS, check: (r) => r.maxCombo >= 12 },
  { id: "run_survive_90", label: "Sobreviva por 90s", rewardCredits: GOAL_REWARD_CREDITS, check: (r) => r.durationSeconds >= 90 },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function pickDailyMissions(): MissionState[] {
  // Deterministic Fisher-Yates shuffle per day.
  const seed = todayStr().split("-").reduce((a, b) => a * 33 + Number(b), 17);
  const rand = seededRng(seed);
  const shuffled = [...MISSION_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, DAILY_MISSIONS_COUNT).map((m) => ({
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
    credits: 0,
    totals: { totalScore: 0, totalSeconds: 0, totalRounds: 0, totalSplits: 0, bestCombo: 0, bestAlive: 0 },
    missions: { date: todayStr(), list: pickDailyMissions() },
    achievements: [],
    goalsCompleted: 0,
    streak: 0,
    lastPlayDate: "",
    climb: {
      bestMultiplier: 0,
      bestZone: 0,
      totalBarriersPassed: 0,
      zonesReachedCount: 0,
    },
  };
}

export function loadProgression(profile: ProgressionProfile = "default"): ProgressionData {
  const key = KEYS[profile];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultData();
    const data = sanitizeProgression(JSON.parse(raw));
    // Reset missions if new day
    if (data.missions.date !== todayStr()) {
      data.missions = { date: todayStr(), list: pickDailyMissions() };
      saveProgression(data, profile);
    }
    return data;
  } catch {
    return defaultData();
  }
}

export function saveProgression(data: ProgressionData, profile: ProgressionProfile = "default") {
  try {
    localStorage.setItem(KEYS[profile], JSON.stringify(data));
  } catch {
    void 0;
  }
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
  creditsGained: number;
  missionsCompleted: MissionState[];
  achievementsUnlocked: AchievementDef[];
  runGoalsCompleted: RunGoalResult[];
  data: ProgressionData;
  streakDays: number;
  streakXpBonus: number;
}

export function applyRound(
  round: RoundSummary,
  profile: ProgressionProfile = "default",
): RoundResult {
  const data = loadProgression(profile);
  const xpBefore = data.xp;
  const levelBefore = levelFromXp(xpBefore).level;
  const creditsBefore = data.credits;

  // Update daily streak
  const today = todayStr();
  if (data.lastPlayDate === yesterdayStr()) {
    data.streak = (data.streak ?? 0) + 1;
  } else if (data.lastPlayDate !== today) {
    data.streak = 1;
  }
  if (data.lastPlayDate !== today) data.lastPlayDate = today;

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
  data.climb.totalBarriersPassed += Math.max(0, round.barriersPassed ?? 0);
  data.climb.bestMultiplier = Math.max(data.climb.bestMultiplier, round.finalMultiplier ?? 0);
  data.climb.bestZone = Math.max(data.climb.bestZone, round.finalZone ?? 0);
  if ((round.finalZone ?? 0) > 0) data.climb.zonesReachedCount += 1;

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

  // Run goals (repeatable rewards)
  const runGoalsCompleted: RunGoalResult[] = [];
  for (const goal of RUN_GOALS) {
    if (!goal.check(round)) continue;
    runGoalsCompleted.push({
      id: goal.id,
      label: goal.label,
      rewardCredits: goal.rewardCredits,
    });
  }

  const creditsGained = runGoalsCompleted.reduce((sum, g) => sum + g.rewardCredits, 0);

  // Streak XP bonus
  const streakXpBonus = data.streak >= 7 ? 0.20 : data.streak >= 5 ? 0.15 : data.streak >= 3 ? 0.10 : data.streak >= 2 ? 0.05 : 0;
  if (streakXpBonus > 0) xpGained = Math.round(xpGained * (1 + streakXpBonus));

  data.xp = xpBefore + xpGained;
  data.credits = creditsBefore + creditsGained;
  data.goalsCompleted += runGoalsCompleted.length;
  const levelAfter = levelFromXp(data.xp).level;

  saveProgression(data, profile);

  return {
    xpGained,
    xpBefore,
    xpAfter: data.xp,
    levelBefore,
    levelAfter,
    creditsGained,
    missionsCompleted,
    achievementsUnlocked: unlocked,
    runGoalsCompleted,
    data,
    streakDays: data.streak,
    streakXpBonus,
  };
}

export function getAllAchievements(): AchievementDef[] {
  return ACHIEVEMENTS;
}

export function getRunGoals(): RunGoalDef[] {
  return RUN_GOALS;
}

function seededRng(initialSeed: number): () => number {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

function sanitizeProgression(input: unknown): ProgressionData {
  const fallback = defaultData();
  if (!input || typeof input !== "object") return fallback;
  const obj = input as Record<string, unknown>;
  return {
    xp: toNonNegativeInt(obj.xp),
    credits: toNonNegativeInt(obj.credits),
    totals: sanitizeTotals(obj.totals, fallback.totals),
    missions: sanitizeMissions(obj.missions),
    achievements: Array.isArray(obj.achievements)
      ? obj.achievements.filter((id): id is string => typeof id === "string")
      : [],
    goalsCompleted: toNonNegativeInt(obj.goalsCompleted),
    streak: toNonNegativeInt(obj.streak),
    lastPlayDate: typeof obj.lastPlayDate === "string" ? obj.lastPlayDate : "",
    climb: sanitizeClimb(obj.climb),
  };
}

function sanitizeClimb(input: unknown): ProgressionData["climb"] {
  if (!input || typeof input !== "object") {
    return {
      bestMultiplier: 0,
      bestZone: 0,
      totalBarriersPassed: 0,
      zonesReachedCount: 0,
    };
  }
  const c = input as Record<string, unknown>;
  return {
    bestMultiplier: toNonNegativeFloat(c.bestMultiplier),
    bestZone: toNonNegativeInt(c.bestZone),
    totalBarriersPassed: toNonNegativeInt(c.totalBarriersPassed),
    zonesReachedCount: toNonNegativeInt(c.zonesReachedCount),
  };
}

function sanitizeTotals(input: unknown, fallback: Totals): Totals {
  if (!input || typeof input !== "object") return fallback;
  const t = input as Record<string, unknown>;
  return {
    totalScore: toNonNegativeInt(t.totalScore),
    totalSeconds: toNonNegativeInt(t.totalSeconds),
    totalRounds: toNonNegativeInt(t.totalRounds),
    totalSplits: toNonNegativeInt(t.totalSplits),
    bestCombo: toNonNegativeInt(t.bestCombo),
    bestAlive: toNonNegativeInt(t.bestAlive),
  };
}

function sanitizeMissions(input: unknown): { date: string; list: MissionState[] } {
  const date = todayStr();
  if (!input || typeof input !== "object") return { date, list: pickDailyMissions() };
  const m = input as Record<string, unknown>;
  const rawList = Array.isArray(m.list) ? m.list : [];
  const list = rawList
    .map((item) => sanitizeMission(item))
    .filter((mission): mission is MissionState => mission !== null);
  return {
    date: typeof m.date === "string" ? m.date : date,
    list: list.length > 0 ? list.slice(0, DAILY_MISSIONS_COUNT) : pickDailyMissions(),
  };
}

function sanitizeMission(input: unknown): MissionState | null {
  if (!input || typeof input !== "object") return null;
  const m = input as Record<string, unknown>;
  const id = typeof m.id === "string" ? m.id : null;
  if (!id) return null;
  const def = MISSION_POOL.find((mission) => mission.id === id);
  if (!def) return null;
  const goal = toNonNegativeInt(m.goal) || def.goal;
  const progress = Math.min(goal, toNonNegativeInt(m.progress));
  return {
    id,
    label: typeof m.label === "string" ? m.label : def.label,
    goal,
    xp: toNonNegativeInt(m.xp) || def.xp,
    progress,
    done: Boolean(m.done) || progress >= goal,
  };
}

function toNonNegativeInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function toNonNegativeFloat(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
