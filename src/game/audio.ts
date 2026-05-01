// Minimal WebAudio SFX + haptics. Lazy-init on first user gesture.

let ctx: AudioContext | null = null;
let muted = false;
const MUTE_KEY = "ns_muted";

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch { /* localStorage not available */ }

export function isMuted() {
  return muted;
}
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch { /* localStorage not available */ }
}

interface WindowWithWebkitAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function unlockAudio() {
  if (ctx) return;
  try {
    const C = window.AudioContext || (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!C) return;
    ctx = new C();
  } catch { /* AudioContext not available */ }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05) {
  if (muted || !ctx) return;
  try {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* audio context op failed */ }
}

export const sfx = {
  tap: () => tone(420, 0.05, "triangle", 0.04),
  split: () => tone(680, 0.08, "triangle", 0.05),
  pass: (n: number) => tone(440 + Math.min(n, 16) * 30, 0.08, "sine", 0.05),
  gameOver: () => {
    tone(220, 0.18, "sawtooth", 0.06);
    setTimeout(() => tone(160, 0.25, "sawtooth", 0.05), 120);
  },
};

export const hapticPatterns = {
  tap: 10,
  hit: 40,
};

export function haptic(ms: number) {
  if (muted) return;
  try {
    if ("vibrate" in navigator) navigator.vibrate(ms);
  } catch { /* vibration API not available */ }
}
