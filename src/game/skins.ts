// ============================================================================
// Skins de bola — paletas de hue desbloqueáveis por pontuação lifetime.
// ============================================================================

export interface Skin {
  id: string;
  name: string;
  hues: number[];
  /** Pontuação lifetime mínima para desbloquear (0 = padrão) */
  unlockAt: number;
  /** Cor de pré-visualização (gradiente CSS) */
  preview: string;
}

export const SKINS: Skin[] = [
  {
    id: "default",
    name: "Neon",
    hues: [180, 320, 55, 140, 270, 25],
    unlockAt: 0,
    preview: "linear-gradient(135deg, hsl(180,100%,60%), hsl(320,100%,60%))",
  },
  {
    id: "solar",
    name: "Solar",
    hues: [25, 45, 0, 15, 35, 55],
    unlockAt: 100,
    preview: "linear-gradient(135deg, hsl(25,100%,60%), hsl(0,100%,60%))",
  },
  {
    id: "toxic",
    name: "Toxic",
    hues: [90, 120, 75, 140, 60, 100],
    unlockAt: 500,
    preview: "linear-gradient(135deg, hsl(90,100%,55%), hsl(140,100%,55%))",
  },
  {
    id: "ice",
    name: "Ice",
    hues: [180, 200, 220, 190, 210, 170],
    unlockAt: 2000,
    preview: "linear-gradient(135deg, hsl(180,100%,75%), hsl(220,100%,70%))",
  },
  {
    id: "void",
    name: "Void",
    hues: [270, 290, 310, 250, 280, 300],
    unlockAt: 10000,
    preview: "linear-gradient(135deg, hsl(270,100%,55%), hsl(310,100%,55%))",
  },
  {
    id: "rainbow",
    name: "Rainbow",
    hues: [0, 60, 120, 180, 240, 300],
    unlockAt: 50000,
    preview:
      "linear-gradient(135deg, hsl(0,100%,60%), hsl(60,100%,60%), hsl(120,100%,55%), hsl(200,100%,60%), hsl(280,100%,60%))",
  },
];

const SKIN_KEY = "ns_skin";
const LIFETIME_KEY = "ns_lifetime_score";

export function getLifetimeScore(): number {
  try {
    return Number(localStorage.getItem(LIFETIME_KEY) || 0);
  } catch {
    return 0;
  }
}

export function addLifetimeScore(delta: number): number {
  const next = getLifetimeScore() + Math.max(0, delta);
  try {
    localStorage.setItem(LIFETIME_KEY, String(next));
  } catch {}
  return next;
}

export function getSelectedSkin(): Skin {
  try {
    const id = localStorage.getItem(SKIN_KEY) || "default";
    const lifetime = getLifetimeScore();
    const skin = SKINS.find((s) => s.id === id);
    if (skin && lifetime >= skin.unlockAt) return skin;
  } catch {}
  return SKINS[0];
}

export function setSelectedSkin(id: string) {
  try {
    localStorage.setItem(SKIN_KEY, id);
  } catch {}
}

export function isUnlocked(skin: Skin): boolean {
  return getLifetimeScore() >= skin.unlockAt;
}
