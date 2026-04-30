// ============================================================================
// Settings — preferências do jogador (volume, haptics, FPS, daltônico).
// ============================================================================

export interface Settings {
  musicVolume: number; // 0..1 (futuro)
  sfxVolume: number; // 0..1
  hapticsEnabled: boolean;
  showFps: boolean;
  colorblind: boolean;
}

const KEY = "ns_settings";

const DEFAULTS: Settings = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  hapticsEnabled: true,
  showFps: false,
  colorblind: false,
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cache = { ...DEFAULTS, ...parsed };
      return cache!;
    }
  } catch {}
  cache = { ...DEFAULTS };
  return cache;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}
