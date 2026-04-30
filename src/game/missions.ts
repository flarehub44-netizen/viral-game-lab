// ============================================================================
// Missões Diárias — geradas determinísticamente por seed da data.
// Estado salvo em localStorage. Sem backend.
// ============================================================================

export type MissionId =
  | "perfectStreak"
  | "survive"
  | "multBalls"
  | "nearMisses"
  | "scoreOnce";

export interface MissionTemplate {
  id: MissionId;
  label: (target: number) => string;
  /** Possíveis alvos para variar dificuldade */
  targets: number[];
}

export interface Mission {
  id: MissionId;
  target: number;
  label: string;
  progress: number;
  completed: boolean;
}

const TEMPLATES: MissionTemplate[] = [
  {
    id: "perfectStreak",
    label: (n) => `Faça ${n} passes perfeitos seguidos`,
    targets: [5, 8, 12],
  },
  {
    id: "survive",
    label: (n) => `Sobreviva ${n}s sem pegar power-up`,
    targets: [25, 40, 60],
  },
  {
    id: "multBalls",
    label: (n) => `Atinja ×${n} bolinhas vivas`,
    targets: [6, 10, 16],
  },
  {
    id: "nearMisses",
    label: (n) => `Faça ${n} near-misses numa run`,
    targets: [3, 5, 8],
  },
  {
    id: "scoreOnce",
    label: (n) => `Faça ${n.toLocaleString()} pontos numa run`,
    targets: [500, 1500, 3500],
  },
];

const KEY_PREFIX = "ns_missions_";
const STREAK_KEY = "ns_mission_streak";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hash simples e determinístico para virar seed. */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateForDate(dateKey: string): Mission[] {
  const rnd = mulberry32(hash(dateKey));
  // Pega 3 templates únicos
  const pool = [...TEMPLATES];
  const chosen: MissionTemplate[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(rnd() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen.map((t) => {
    const target = t.targets[Math.floor(rnd() * t.targets.length)];
    return {
      id: t.id,
      target,
      label: t.label(target),
      progress: 0,
      completed: false,
    };
  });
}

export function getTodayMissions(): Mission[] {
  const key = KEY_PREFIX + todayKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Mission[];
      if (Array.isArray(parsed) && parsed.length === 3) return parsed;
    }
  } catch {}
  const fresh = generateForDate(todayKey());
  try {
    localStorage.setItem(key, JSON.stringify(fresh));
  } catch {}
  return fresh;
}

function saveMissions(missions: Mission[]) {
  try {
    localStorage.setItem(KEY_PREFIX + todayKey(), JSON.stringify(missions));
  } catch {}
}

/** Stats finais de uma run para checagem de missões. */
export interface RunSummary {
  score: number;
  maxMultiplier: number;
  durationSeconds: number;
  bestPerfectStreak: number;
  nearMisses: number;
  pickedAnyPowerup: boolean;
}

/** Atualiza missões com base numa run. Retorna missões recém-completadas. */
export function applyRunToMissions(run: RunSummary): Mission[] {
  const missions = getTodayMissions();
  const newlyCompleted: Mission[] = [];
  for (const m of missions) {
    if (m.completed) continue;
    let value = m.progress;
    switch (m.id) {
      case "perfectStreak":
        value = Math.max(value, run.bestPerfectStreak);
        break;
      case "survive":
        if (!run.pickedAnyPowerup) value = Math.max(value, run.durationSeconds);
        break;
      case "multBalls":
        value = Math.max(value, run.maxMultiplier);
        break;
      case "nearMisses":
        value = Math.max(value, run.nearMisses);
        break;
      case "scoreOnce":
        value = Math.max(value, run.score);
        break;
    }
    m.progress = value;
    if (value >= m.target) {
      m.completed = true;
      newlyCompleted.push(m);
    }
  }
  saveMissions(missions);
  // Streak: se TODAS as 3 estiverem completas hoje e ainda não contamos
  if (missions.every((m) => m.completed)) {
    bumpStreakIfNeeded();
  }
  return newlyCompleted;
}

function bumpStreakIfNeeded() {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const data = raw ? (JSON.parse(raw) as { lastDate: string; count: number }) : null;
    const today = todayKey();
    if (data?.lastDate === today) return; // já contado
    // Verifica se ontem também completou
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    const continues = data?.lastDate === yKey;
    const next = { lastDate: today, count: continues ? data!.count + 1 : 1 };
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  } catch {}
}

export function getStreak(): number {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw) as { lastDate: string; count: number };
    const today = todayKey();
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    if (data.lastDate === today || data.lastDate === yKey) return data.count;
    return 0;
  } catch {
    return 0;
  }
}
