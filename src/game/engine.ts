import { sfx, haptic } from "./audio";

// ============================================================================
// Neon Split — Game Engine
// ============================================================================
// Vertical scrolling tunnel. Player taps to split balls. Balls fall and must
// pass through gaps in horizontal barriers that scroll up toward them.
// ----------------------------------------------------------------------------

export type GameState = "ready" | "countdown" | "playing" | "paused" | "over";

export interface PublicGameStats {
  score: number;
  multiplier: number; // current alive balls
  maxMultiplier: number;
  alive: number;
  state: GameState;
  durationSeconds: number;
  combo: number;
  comboMultiplier: number;
  /** 0..1 — current combo bar fill (drains over time, refills on perfect pass) */
  comboBar: number;
  /** Countdown number to display (3,2,1) when state === "countdown", else null */
  countdown: number | null;
  /** Maior streak de passes perfeitos atingido na run */
  bestPerfectStreak: number;
  /** Quantos near-misses na run */
  nearMisses: number;
  /** Coletou ao menos um power-up nesta run */
  pickedAnyPowerup: boolean;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alive: boolean;
  shielded: boolean;
  trail: { x: number; y: number; a: number }[];
}

interface Barrier {
  y: number;
  height: number;
  // Gaps in normalized [0..1] x ranges
  gaps: { start: number; end: number }[];
  hue: number;
  passed: boolean;
  speed: number; // px/s (positive = moves up)
  /** True for barriers with very tight gaps — render warning pulse */
  dangerous: boolean;
  /** Has the player's near-miss check already fired for this barrier? */
  nearMissChecked: boolean;
}

type PowerKind = "shield" | "slowmo" | "magnet";
interface PowerUp {
  x: number;
  y: number;
  kind: PowerKind;
  collected: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  hue: number;
  life: number;
  maxLife: number;
  size: number;
  vy: number;
}

const DEFAULT_HUES = [180, 320, 55, 140, 270, 25];

interface EngineCallbacks {
  onStatsChange: (stats: PublicGameStats) => void;
  onGameOver: (stats: PublicGameStats) => void;
}

export interface EngineOptions {
  /** Paletas de hue customizadas (skin selecionada) */
  hues?: number[];
  /** Modo "attract": loop demo sem colisão / sem game over (usado no menu) */
  attract?: boolean;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0; // CSS pixels
  private height = 0;

  private balls: Ball[] = [];
  private barriers: Barrier[] = [];
  private powerups: PowerUp[] = [];
  private particles: Particle[] = [];
  private floatTexts: FloatText[] = [];

  private score = 0;
  private maxMultiplier = 1;
  private state: GameState = "ready";
  private rafId: number | null = null;
  private lastTs = 0;
  private startTs = 0;
  private elapsedMs = 0;
  private lastEmitTs = 0; // throttle stats updates to React

  private spawnTimer = 0;
  private nextSpawnIn = 0;
  private powerupTimer = 0;

  private slowMoUntil = 0;
  private magnetUntil = 0;
  private shakeUntil = 0;
  private shakeIntensity = 0;
  private flashUntil = 0;

  // Combo system: consecutive perfect passes
  private combo = 0;
  private graceUntil = 0; // brief invulnerability right after a tap (tap feel)
  /** 0..1 combo bar — fills on perfect pass, drains over time */
  private comboBar = 0;
  private static readonly COMBO_DRAIN_PER_SEC = 0.33; // ~3s to drain from full

  // Frame counter (stable trail throttling, not tied to timestep)
  private frameCount = 0;

  // Countdown before play
  private countdownEndsAt = 0; // performance.now() ms
  private static readonly COUNTDOWN_MS = 3000;

  // Pause: time spent paused, used to keep startTs honest for elapsed
  private pausedAt = 0;

  // Pre-rendered ball sprites (one per hue) — eliminates shadowBlur in hot loop
  private ballSprites = new Map<number, HTMLCanvasElement>();
  private static readonly SPRITE_R = 32; // sprite radius in px (drawn scaled)
  /** Effective sprite resolution (scales with DPR for crispness on Retina) */
  private spriteScale = 1;

  private cb: EngineCallbacks;
  private HUES: number[] = DEFAULT_HUES;
  private attract = false;

  // Mission tracking
  private bestPerfectStreak = 0;
  private nearMisses = 0;
  private pickedAnyPowerup = false;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks, options: EngineOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;
    if (options.hues && options.hues.length > 0) this.HUES = options.hues;
    this.attract = !!options.attract;
    this.buildSprites();
    this.handleResize();
  }

  /** Pre-render glowing ball sprites to offscreen canvases (one per hue). */
  private buildSprites() {
    // Render sprites at 2x on HiDPI displays so drawImage scaling stays crisp.
    const scale = (window.devicePixelRatio || 1) >= 2 ? 2 : 1;
    if (scale === this.spriteScale && this.ballSprites.size > 0) return;
    this.spriteScale = scale;
    const R = GameEngine.SPRITE_R * scale;
    const size = R * 2;
    this.ballSprites.clear();
    for (const hue of this.HUES) {
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const oc = off.getContext("2d")!;
      // Outer soft glow
      const glow = oc.createRadialGradient(R, R, 1, R, R, R);
      glow.addColorStop(0, `hsla(${hue}, 100%, 75%, 1)`);
      glow.addColorStop(0.35, `hsla(${hue}, 100%, 60%, 0.7)`);
      glow.addColorStop(0.7, `hsla(${hue}, 100%, 50%, 0.18)`);
      glow.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
      oc.fillStyle = glow;
      oc.fillRect(0, 0, size, size);
      // Bright core
      const core = oc.createRadialGradient(R, R, 0, R, R, R * 0.5);
      core.addColorStop(0, `hsl(${hue}, 100%, 95%)`);
      core.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
      oc.fillStyle = core;
      oc.fillRect(0, 0, size, size);
      this.ballSprites.set(hue, off);
    }
  }

  // ---------------- public API ----------------
  start() {
    this.reset();
    this.spawnInitialBall();
    this.nextSpawnIn = 1.1;
    this.powerupTimer = 4;
    // Begin with a 3-2-1 countdown that freezes spawn/collisions/score time
    this.state = "countdown";
    const now = performance.now();
    this.countdownEndsAt = now + GameEngine.COUNTDOWN_MS;
    this.startTs = this.countdownEndsAt; // elapsed only counts after GO
    this.lastTs = now;
    this.emitStats();
    this.loop(now);
  }

  /** Pause the game (no-op if not playing). Keeps RAF running for render. */
  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.pausedAt = performance.now();
    this.emitStats();
  }

  /** Resume from pause. Adjusts time-based timers so they don't fire instantly. */
  resume() {
    if (this.state !== "paused") return;
    const now = performance.now();
    const delta = now - this.pausedAt;
    // Shift all absolute-time deadlines forward by the pause duration
    this.slowMoUntil += delta;
    this.magnetUntil += delta;
    this.shakeUntil += delta;
    this.flashUntil += delta;
    this.graceUntil += delta;
    this.lastTs = now;
    this.state = "playing";
    this.emitStats();
  }

  stop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** User tapped — split all alive balls in two */
  tap() {
    if (this.state !== "playing") return;
    // balls array only contains alive balls (dead are pruned each frame)
    const alive = this.balls;
    if (alive.length === 0) return;
    if (alive.length >= 128) return; // safety cap (lower = stable on long runs)
    sfx.split();
    haptic(8); // light tactile pulse to give the tap "weight"
    const ts = performance.now();
    // Brief grace window so a tap doesn't insta-kill mid-barrier
    this.graceUntil = ts + 90;
    const hue = this.HUES[Math.min(Math.floor(Math.log2(alive.length * 2)), this.HUES.length - 1)];
    for (const b of alive) {
      // Push outward symmetrically — wider spread feels more impactful
      const spread = 110 + Math.random() * 40;
      const newBall: Ball = {
        x: b.x,
        y: b.y,
        vx: spread,
        vy: b.vy,
        radius: Math.max(8, b.radius * 0.97),
        hue,
        alive: true,
        shielded: false,
        trail: [],
      };
      b.vx = -spread;
      b.radius = Math.max(8, b.radius * 0.97);
      b.hue = hue;
      this.balls.push(newBall);
    }
  }

  handleResize() {
    // Cap DPR at 2 — render @ 3x is wasted on high-end mobiles for our visuals
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Set defaults that don't change every frame
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    // Rebuild sprites if DPR changed (e.g. window dragged between monitors)
    this.buildSprites();
  }

  // ---------------- internal ----------------
  private reset() {
    this.stop();
    this.balls = [];
    this.barriers = [];
    this.powerups = [];
    this.particles = [];
    this.floatTexts = [];
    this.score = 0;
    this.maxMultiplier = 1;
    this.elapsedMs = 0;
    this.spawnTimer = 0;
    this.slowMoUntil = 0;
    this.magnetUntil = 0;
    this.shakeUntil = 0;
    this.flashUntil = 0;
    this.combo = 0;
    this.comboBar = 0;
    this.graceUntil = 0;
    this.frameCount = 0;
    this.pausedAt = 0;
    this.bestPerfectStreak = 0;
    this.nearMisses = 0;
    this.pickedAnyPowerup = false;
  }

  private spawnInitialBall() {
    this.balls.push({
      x: this.width / 2,
      y: this.height * 0.25,
      vx: 0,
      vy: 0,
      radius: 12,
      hue: this.HUES[0],
      alive: true,
      shielded: false,
      trail: [],
    });
  }

  private currentDifficulty() {
    // 0..1 grows with time, capped. Slower ramp so 10min sessions stay playable.
    const t = this.elapsedMs / 1000;
    return Math.min(0.92, t / 120);
  }

  private comboMultiplier() {
    // 1x, then 1.5x, 2x, 3x, 4x... capped at 8x
    if (this.combo < 3) return 1;
    if (this.combo < 6) return 1.5;
    if (this.combo < 10) return 2;
    if (this.combo < 16) return 3;
    if (this.combo < 24) return 4;
    if (this.combo < 35) return 6;
    return 8;
  }

  private addFloatText(x: number, y: number, text: string, hue: number, size = 22) {
    this.floatTexts.push({
      x,
      y,
      text,
      hue,
      life: 0,
      maxLife: 0.9,
      size,
      vy: -60,
    });
  }

  private spawnBarrier() {
    const diff = this.currentDifficulty();
    const speed = 90 + diff * 160; // px/s upward
    const height = 14 + Math.random() * 8;
    // Gap count decreases over time, gap width shrinks
    const baseGapWidth = 0.22 - diff * 0.1;
    const gapCount = Math.random() < 0.55 + diff * 0.15 ? 1 : 2;
    const gaps: { start: number; end: number }[] = [];
    if (gapCount === 1) {
      const center = 0.18 + Math.random() * 0.64;
      const w = baseGapWidth + Math.random() * 0.05;
      gaps.push({ start: Math.max(0, center - w / 2), end: Math.min(1, center + w / 2) });
    } else {
      const w = baseGapWidth * 0.8;
      const c1 = 0.15 + Math.random() * 0.25;
      const c2 = 0.6 + Math.random() * 0.25;
      gaps.push({ start: Math.max(0, c1 - w / 2), end: c1 + w / 2 });
      gaps.push({ start: c2 - w / 2, end: Math.min(1, c2 + w / 2) });
    }
    const hue = this.HUES[Math.floor(Math.random() * this.HUES.length)];
    // Total gap width — shrinks with difficulty + multi-gap. Below threshold,
    // we flag as "dangerous" so render layer pulses a warning color.
    const totalGap = gaps.reduce((s, g) => s + (g.end - g.start), 0);
    const dangerous = totalGap < 0.18 || (gapCount === 2 && diff > 0.45);
    this.barriers.push({
      y: this.height + 20,
      height,
      gaps,
      hue,
      passed: false,
      speed,
      dangerous,
      nearMissChecked: false,
    });
  }

  private spawnPowerup() {
    const kinds: PowerKind[] = ["shield", "slowmo", "magnet"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.powerups.push({
      x: 30 + Math.random() * (this.width - 60),
      y: this.height + 10,
      kind,
      collected: false,
    });
  }

  private spawnParticles(x: number, y: number, hue: number, count = 18) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4,
        hue,
        size: 2 + Math.random() * 3,
      });
    }
  }

  private loop = (ts: number) => {
    // Keep RAF alive in countdown/paused/playing — only stop on over/ready
    if (this.state === "over" || this.state === "ready") return;
    this.frameCount++;

    if (this.state === "countdown") {
      // Render-only: show overlay number, no game advance
      this.lastTs = ts;
      this.render(ts);
      // Throttle stats so the React countdown number updates ~10Hz
      this.maybeEmitStats();
      if (ts >= this.countdownEndsAt) {
        this.state = "playing";
        this.startTs = ts;
        this.emitStats();
      }
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    if (this.state === "paused") {
      // Freeze: keep last frame on screen, don't advance time
      this.lastTs = ts;
      this.render(ts);
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    const rawDt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const slow = ts < this.slowMoUntil;
    const dt = Math.min(0.05, rawDt) * (slow ? 0.4 : 1);
    this.elapsedMs += dt * 1000;

    this.update(dt, ts);
    this.render(ts);

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number, ts: number) {
    const diff = this.currentDifficulty();

    // Spawn barriers
    this.spawnTimer += dt;
    const spawnInterval = Math.max(0.55, 1.2 - diff * 0.7);
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnBarrier();
    }

    // Spawn powerups occasionally — more frequent
    this.powerupTimer -= dt;
    if (this.powerupTimer <= 0) {
      this.spawnPowerup();
      this.powerupTimer = 4 + Math.random() * 4;
    }

    // Update barriers
    for (const bar of this.barriers) {
      bar.y -= bar.speed * dt;
    }

    // Update powerups (move up with average barrier speed)
    const pSpeed = 100 + diff * 140;
    for (const p of this.powerups) {
      p.y -= pSpeed * dt;
    }

    // Update balls (array contains only alive balls — pruned each frame)
    const aliveBefore = this.balls.length;
    for (const b of this.balls) {
      if (!b.alive) continue;

      // Magnet: nudge toward nearest gap of the next barrier
      if (ts < this.magnetUntil) {
        const next = this.barriers.find((bar) => bar.y > b.y - 5 && !bar.passed);
        if (next) {
          // Find nearest gap center
          let bestCenter = b.x;
          let bestDist = Infinity;
          for (const g of next.gaps) {
            const cx = ((g.start + g.end) / 2) * this.width;
            const d = Math.abs(cx - b.x);
            if (d < bestDist) {
              bestDist = d;
              bestCenter = cx;
            }
          }
          const pull = (bestCenter - b.x) * 2.5;
          b.vx += pull * dt;
        }
      }

      // Apply friction to horizontal velocity
      b.vx *= Math.pow(0.5, dt * 2);
      b.x += b.vx * dt;
      // Vertical: gentle gravity to keep balls in mid-screen — they "fall" but
      // the world scrolls up faster. We keep balls roughly fixed near 35% height.
      const targetY = this.height * 0.4;
      b.vy += (targetY - b.y) * 4 * dt;
      b.vy *= Math.pow(0.5, dt * 3);
      b.y += b.vy * dt;

      // Bounce off side walls
      if (b.x < b.radius) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * 0.6;
      } else if (b.x > this.width - b.radius) {
        b.x = this.width - b.radius;
        b.vx = -Math.abs(b.vx) * 0.6;
      }

      // Lightweight trail (every other frame, max 4 points). Frame counter is
      // FPS-independent so trail spacing stays even on slow devices.
      if (this.frameCount % 2 === 0) {
        b.trail.push({ x: b.x, y: b.y, a: 1 });
        if (b.trail.length > 4) b.trail.shift();
        for (const t of b.trail) t.a *= 0.78;
      }
    }

    // Collisions: ball vs barrier
    for (const bar of this.barriers) {
      if (bar.passed) continue;
      const top = bar.y;
      const bottom = bar.y + bar.height;

      for (const b of this.balls) {
        if (!b.alive) continue;
        // Ball is crossing barrier band?
        if (b.y + b.radius >= top && b.y - b.radius <= bottom) {
          const nx = b.x / this.width;
          const inGap = bar.gaps.some(
            (g) => nx >= g.start + 0.005 && nx <= g.end - 0.005,
          );
          if (!inGap) {
            // Tap grace: brief invuln right after splitting
            if (ts < this.graceUntil) continue;
            if (b.shielded) {
              b.shielded = false;
              this.spawnParticles(b.x, b.y, b.hue, 10);
            } else {
              b.alive = false;
              sfx.hit();
              haptic(40); // strong tactile feedback on death
              this.spawnParticles(b.x, b.y, b.hue, 24);
              this.shakeUntil = ts + 240;
              this.shakeIntensity = 7;
              // Reset combo on any loss
              if (this.combo > 5) {
                this.addFloatText(b.x, b.y - 20, "COMBO X", 0, 16);
              }
              this.combo = 0;
              this.comboBar = 0;
            }
          } else if (!bar.nearMissChecked) {
            // Near-miss: ball passed through gap but very close to an edge.
            // Check distance from ball edge to nearest gap boundary in px.
            const px = b.x;
            let minEdgeDist = Infinity;
            for (const g of bar.gaps) {
              if (nx >= g.start && nx <= g.end) {
                const left = g.start * this.width;
                const right = g.end * this.width;
                const d = Math.min(px - left, right - px);
                if (d < minEdgeDist) minEdgeDist = d;
              }
            }
            // Only count as near-miss if within 6px of the edge (very tight)
            if (minEdgeDist >= 0 && minEdgeDist < 6) {
              const cm = this.comboMultiplier();
              const bonus = 5 * cm;
              this.score += bonus;
              this.addFloatText(b.x, b.y - 18, "NEAR!", 180, 16);
              haptic(15);
              this.flashUntil = Math.max(this.flashUntil, ts + 80);
              bar.nearMissChecked = true; // one near-miss bonus per barrier
            }
          }
        }
      }

      // When barrier fully scrolled past the band, mark passed and award
      if (bar.y + bar.height < this.height * 0.4 - 30 && !bar.passed) {
        bar.passed = true;
        const aliveNow = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
        if (aliveNow > 0) {
          const perfect = aliveNow === aliveBefore;
          if (perfect) {
            this.combo += 1;
            // Refill combo bar — fully on perfect, partial on plain pass
            this.comboBar = Math.min(1, this.comboBar + 0.35);
          } else {
            this.comboBar = Math.min(1, this.comboBar + 0.12);
          }
          const comboMult = this.comboMultiplier();
          // Quadratic-ish reward: more balls = exponentially more pts
          const base = aliveNow + Math.floor(aliveNow * aliveNow * 0.25);
          const gained = Math.max(1, Math.floor(base * comboMult));
          this.score += gained;
          sfx.pass(aliveNow);

          // Floating "+points" text near barrier
          const cx = this.width / 2;
          const cy = this.height * 0.4 - 10;
          const hue = aliveNow >= 16 ? 320 : aliveNow >= 8 ? 55 : 180;
          this.addFloatText(cx, cy, `+${gained}`, hue, 22 + Math.min(18, aliveNow));

          if (perfect && aliveNow >= 4) {
            sfx.perfect();
            this.flashUntil = ts + 140;
            if (this.combo >= 3 && this.combo % 3 === 0) {
              this.addFloatText(cx, cy - 30, `COMBO ×${comboMult}`, 320, 20);
            }
          }
        }
      }
    }

    // Drain combo bar over time (~3s to empty from full)
    this.comboBar = Math.max(0, this.comboBar - GameEngine.COMBO_DRAIN_PER_SEC * dt);
    if (this.comboBar === 0 && this.combo > 0) {
      // Bar fully empty → reset combo silently
      this.combo = 0;
    }

    // Collisions: ball vs powerup
    for (const p of this.powerups) {
      if (p.collected) continue;
      for (const b of this.balls) {
        if (!b.alive) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy < (b.radius + 14) ** 2) {
          p.collected = true;
          sfx.powerup();
          haptic(20);
          if (p.kind === "shield") {
            for (const bb of this.balls) if (bb.alive) bb.shielded = true;
          } else if (p.kind === "slowmo") {
            this.slowMoUntil = ts + 2200;
          } else if (p.kind === "magnet") {
            this.magnetUntil = ts + 4000;
          }
          break;
        }
      }
    }

    // Cleanup off-screen + prune dead balls (prevents unbounded growth)
    this.barriers = this.barriers.filter((b) => b.y + b.height > -20);
    // Hard caps on barriers to defend against pathological frame drops
    if (this.barriers.length > 60) this.barriers.length = 60;
    this.powerups = this.powerups.filter((p) => !p.collected && p.y > -30);
    const hadBalls = this.balls.length > 0;
    this.balls = this.balls.filter((b) => b.alive);

    // Particles (capped)
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    if (this.particles.length > 240) {
      this.particles.splice(0, this.particles.length - 240);
    }

    // Floating texts (capped)
    for (const f of this.floatTexts) {
      f.life += dt;
      f.y += f.vy * dt;
      f.vy *= 0.94;
    }
    this.floatTexts = this.floatTexts.filter((f) => f.life < f.maxLife);
    if (this.floatTexts.length > 24) {
      this.floatTexts.splice(0, this.floatTexts.length - 24);
    }

    // Track multiplier
    const aliveAfter = this.balls.length;
    if (aliveAfter > this.maxMultiplier) this.maxMultiplier = aliveAfter;

    // Game over
    if (aliveAfter === 0 && hadBalls) {
      this.state = "over";
      sfx.gameOver();
      const stats = this.snapshot();
      this.cb.onGameOver(stats);
      return;
    }

    this.maybeEmitStats();
  }

  private snapshot(): PublicGameStats {
    const alive = this.balls.length;
    let countdown: number | null = null;
    if (this.state === "countdown") {
      const remaining = Math.max(0, this.countdownEndsAt - performance.now());
      countdown = Math.ceil(remaining / 1000);
    }
    return {
      score: this.score,
      multiplier: alive,
      maxMultiplier: this.maxMultiplier,
      alive,
      state: this.state,
      durationSeconds: Math.floor(this.elapsedMs / 1000),
      combo: this.combo,
      comboMultiplier: this.comboMultiplier(),
      comboBar: this.comboBar,
      countdown,
    };
  }

  /** Throttled emit (~10 Hz) so React doesn't re-render every frame. */
  private maybeEmitStats() {
    const now = performance.now();
    if (now - this.lastEmitTs < 100) return;
    this.lastEmitTs = now;
    this.cb.onStatsChange(this.snapshot());
  }

  private emitStats() {
    this.lastEmitTs = performance.now();
    this.cb.onStatsChange(this.snapshot());
  }

  // ---------------- rendering ----------------
  private render(ts: number) {
    const c = this.ctx;
    const W = this.width;
    const H = this.height;

    // Screen shake
    let sx = 0;
    let sy = 0;
    if (ts < this.shakeUntil) {
      const k = (this.shakeUntil - ts) / 220;
      sx = (Math.random() - 0.5) * this.shakeIntensity * k;
      sy = (Math.random() - 0.5) * this.shakeIntensity * k;
    }
    c.save();
    c.translate(sx, sy);

    // Background gradient
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "hsl(260, 40%, 8%)");
    bg.addColorStop(1, "hsl(240, 40%, 3%)");
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    // Subtle grid lines for depth
    c.strokeStyle = "hsla(180, 50%, 50%, 0.05)";
    c.lineWidth = 1;
    const gridY = ((ts / 30) % 40);
    for (let y = -40 + gridY; y < H; y += 40) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }

    // Player band marker (subtle) — solid line is much cheaper than dashed
    const bandY = H * 0.4;
    c.strokeStyle = "hsla(180, 100%, 60%, 0.06)";
    c.beginPath();
    c.moveTo(0, bandY);
    c.lineTo(W, bandY);
    c.stroke();

    // Slowmo overlay tint
    if (ts < this.slowMoUntil) {
      c.fillStyle = "hsla(270, 100%, 50%, 0.07)";
      c.fillRect(0, 0, W, H);
    }

    // Barriers
    const playerY = H * 0.4;
    for (const bar of this.barriers) {
      this.drawBarrier(c, bar, W, ts, playerY);
    }

    // Powerups
    for (const p of this.powerups) {
      if (p.collected) continue;
      this.drawPowerup(c, p, ts);
    }

    // Particles + balls + floats use additive blending for cheap "glow"
    c.globalCompositeOperation = "lighter";

    // Particles (no shadowBlur — additive blend gives the glow look)
    for (const p of this.particles) {
      const a = 1 - p.life / p.maxLife;
      c.fillStyle = `hsla(${p.hue}, 100%, 65%, ${a * 0.9})`;
      c.beginPath();
      c.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      c.fill();
    }

    // Balls — drawImage from cached sprites (no per-frame gradient, no shadow)
    for (const b of this.balls) {
      if (!b.alive) continue;
      const sprite = this.ballSprites.get(b.hue) ?? this.ballSprites.values().next().value!;
      // Trail (simpler: fewer ops)
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const tr = b.radius * (0.55 + i * 0.05);
        const drawSize = tr * 4;
        c.globalAlpha = t.a * 0.35;
        c.drawImage(sprite, t.x - drawSize / 2, t.y - drawSize / 2, drawSize, drawSize);
      }
      c.globalAlpha = 1;
      const drawSize = b.radius * 4; // sprite is glow-padded — render at 4x radius
      c.drawImage(sprite, b.x - drawSize / 2, b.y - drawSize / 2, drawSize, drawSize);
      // Shield ring
      if (b.shielded) {
        c.strokeStyle = "hsla(180, 100%, 80%, 0.9)";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(b.x, b.y, b.radius + 5, 0, Math.PI * 2);
        c.stroke();
      }
    }

    c.globalCompositeOperation = "source-over";

    // Floating texts (above balls)
    for (const f of this.floatTexts) {
      const t = f.life / f.maxLife;
      const a = 1 - t;
      const scale = 1 + (1 - a) * 0.3;
      c.font = `bold ${Math.floor(f.size * scale)}px Inter, system-ui`;
      c.fillStyle = `hsla(${f.hue}, 100%, ${85 - t * 20}%, ${a})`;
      c.fillText(f.text, f.x, f.y);
    }

    // (floating texts already drawn above)


    // Flash overlay (perfect pass)
    if (ts < this.flashUntil) {
      const a = (this.flashUntil - ts) / 140;
      c.fillStyle = `hsla(0, 0%, 100%, ${a * 0.3})`;
      c.fillRect(0, 0, W, H);
    }

    c.restore();
  }

  private drawBarrier(
    c: CanvasRenderingContext2D,
    bar: Barrier,
    W: number,
    ts: number,
    playerY: number,
  ) {
    const top = bar.y;
    let cursor = 0;
    const segments: [number, number][] = [];
    const sortedGaps = [...bar.gaps].sort((a, b) => a.start - b.start);
    for (const g of sortedGaps) {
      if (g.start > cursor) segments.push([cursor, g.start]);
      cursor = g.end;
    }
    if (cursor < 1) segments.push([cursor, 1]);

    // Warning pulse for dangerous barriers approaching the player band.
    // Active in a window of ~120px before reaching the player line.
    const distToPlayer = top - playerY;
    const inWarnWindow = bar.dangerous && distToPlayer > 0 && distToPlayer < 140;
    let hue = bar.hue;
    let highlightHue = bar.hue;
    if (inWarnWindow) {
      // Pulse hue toward red and add a 1px halo above/below the bar
      const pulse = 0.5 + 0.5 * Math.sin(ts / 60);
      hue = 0; // red
      highlightHue = 0;
      c.fillStyle = `hsla(0, 100%, 60%, ${0.18 + pulse * 0.22})`;
      c.fillRect(0, top - 6, W, bar.height + 12);
    }

    // Solid color bar (no shadowBlur, no per-segment gradient — much faster)
    c.fillStyle = `hsl(${hue}, 100%, ${inWarnWindow ? 60 : 55}%)`;
    for (const [s, e] of segments) {
      c.fillRect(s * W, top, (e - s) * W, bar.height);
    }
    c.fillStyle = `hsla(${highlightHue}, 100%, 92%, 0.9)`;
    for (const [s, e] of segments) {
      c.fillRect(s * W, top, (e - s) * W, 1.5);
    }
  }

  private drawPowerup(c: CanvasRenderingContext2D, p: PowerUp, ts: number) {
    const hue = p.kind === "shield" ? 180 : p.kind === "slowmo" ? 270 : 55;
    const r = 14 + Math.sin(ts / 200) * 2;
    c.strokeStyle = `hsl(${hue}, 100%, 70%)`;
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = `hsla(${hue}, 100%, 90%, 0.95)`;
    c.font = "bold 14px Inter, system-ui";
    const letter = p.kind === "shield" ? "S" : p.kind === "slowmo" ? "T" : "M";
    c.fillText(letter, p.x, p.y + 1);
  }
}
