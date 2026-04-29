// Tiny Web Audio synth — no external assets
let ctx: AudioContext | null = null;
let muted = false;

function ensureCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("ns_muted", m ? "1" : "0");
  } catch {}
}

export function isMuted() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("ns_muted") === "1";
  } catch {
    return muted;
  }
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.15,
  freqEnd?: number,
) {
  if (isMuted()) return;
  const c = ensureCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      c.currentTime + duration,
    );
  }
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration + 0.02);
}

export const sfx = {
  split: () => tone(880, 0.08, "square", 0.08, 1320),
  pass: (mult: number) => {
    const base = 440 + Math.min(mult, 32) * 30;
    tone(base, 0.06, "triangle", 0.06, base * 1.4);
  },
  perfect: () => {
    tone(660, 0.12, "triangle", 0.1, 1320);
    setTimeout(() => tone(990, 0.18, "triangle", 0.08, 1980), 60);
  },
  hit: () => tone(220, 0.18, "sawtooth", 0.1, 80),
  gameOver: () => {
    tone(330, 0.25, "sawtooth", 0.15, 80);
    setTimeout(() => tone(180, 0.4, "sawtooth", 0.12, 50), 120);
  },
  powerup: () => {
    tone(523, 0.08, "sine", 0.1, 784);
    setTimeout(() => tone(784, 0.1, "sine", 0.1, 1046), 70);
  },
  click: () => tone(660, 0.04, "square", 0.05),
};

export function unlockAudio() {
  ensureCtx();
}
