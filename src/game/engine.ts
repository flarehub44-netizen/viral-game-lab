import { sfx, haptic, hapticPatterns } from "./audio";

// Neon Split — minimal engine
// Tap to split balls. Balls fall and must pass through gaps in barriers
// scrolling up. Score = aliveBalls per barrier passed.

export type GameState = "ready" | "countdown" | "playing" | "paused" | "over";

export interface PublicGameStats {
  score: number;
  alive: number;
  state: GameState;
  durationSeconds: number;
  countdown: number | null;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alive: boolean;
  trail: { x: number; y: number }[];
}

interface Barrier {
  y: number;
  height: number;
  gap: { start: number; end: number }; // single gap, normalized [0..1]
  hue: number;
  passed: boolean;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
}

const HUES = [180, 320, 55, 140, 270, 25];

interface EngineCallbacks {
  onStatsChange: (stats: PublicGameStats) => void;
  onGameOver: (stats: PublicGameStats) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;

  private balls: Ball[] = [];
  private barriers: Barrier[] = [];
  private particles: Particle[] = [];

  private score = 0;
  private state: GameState = "ready";
  private rafId: number | null = null;
  private lastTs = 0;
  private startTs = 0;
  private elapsedMs = 0;
  private lastEmitTs = 0;

  private spawnTimer = 0;
  private nextSpawnIn = 0;

  private graceUntil = 0;

  private static readonly MAX_BALLS = 128;
  private static readonly TRAIL_LEN = 4;
  private static readonly MAX_PARTICLES = 40;
  private static readonly COUNTDOWN_MS = 3000;

  private countdownEndsAt = 0;
  private pausedAt = 0;

  private ballSprites = new Map<number, HTMLCanvasElement>();
  private static readonly SPRITE_R = 28;

  private cb: EngineCallbacks;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;
    this.buildSprites();
    this.handleResize();
  }

  private buildSprites() {
    const R = GameEngine.SPRITE_R;
    const size = R * 2;
    this.ballSprites.clear();
    for (const hue of HUES) {
      const off = document.createElement("canvas");
      off.width = size;
      off.height = size;
      const oc = off.getContext("2d")!;
      const glow = oc.createRadialGradient(R, R, 1, R, R, R);
      glow.addColorStop(0, `hsla(${hue}, 100%, 80%, 1)`);
      glow.addColorStop(0.4, `hsla(${hue}, 100%, 60%, 0.6)`);
      glow.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
      oc.fillStyle = glow;
      oc.fillRect(0, 0, size, size);
      const core = oc.createRadialGradient(R, R, 0, R, R, R * 0.5);
      core.addColorStop(0, `hsl(${hue}, 100%, 95%)`);
      core.addColorStop(1, `hsla(${hue}, 100%, 65%, 0)`);
      oc.fillStyle = core;
      oc.fillRect(0, 0, size, size);
      this.ballSprites.set(hue, off);
    }
  }

  // -------- public API --------
  start() {
    this.reset();
    this.spawnInitialBall();
    this.nextSpawnIn = 1.2;
    const now = performance.now();
    this.state = "countdown";
    this.countdownEndsAt = now + GameEngine.COUNTDOWN_MS;
    this.startTs = this.countdownEndsAt;
    this.lastTs = now;
    this.emitStats();
    this.loop(now);
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.pausedAt = performance.now();
    this.emitStats();
  }

  resume() {
    if (this.state !== "paused") return;
    const now = performance.now();
    const delta = now - this.pausedAt;
    this.graceUntil += delta;
    this.lastTs = now;
    this.state = "playing";
    this.emitStats();
  }

  stop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  tap() {
    if (this.state !== "playing") return;
    const ts = performance.now();
    const alive = this.balls.filter((b) => b.alive);
    if (alive.length === 0) return;
    if (alive.length >= GameEngine.MAX_BALLS) return;
    const splitCount = Math.min(alive.length, GameEngine.MAX_BALLS - alive.length);
    if (splitCount <= 0) return;
    sfx.split();
    haptic(hapticPatterns.tap);
    this.graceUntil = ts + 90;
    const hue = HUES[Math.min(Math.floor(Math.log2(alive.length + splitCount)), HUES.length - 1)];
    for (let i = 0; i < splitCount; i++) {
      const b = alive[i];
      const direction = i % 2 === 0 ? 1 : -1;
      const spread = direction * (190 + Math.random() * 90);
      const jitterX = direction * (b.radius * 1.8 + Math.random() * 10);
      const jitterY = (Math.random() - 0.5) * 18;
      this.balls.push({
        x: b.x + jitterX,
        y: b.y + jitterY,
        vx: spread,
        vy: b.vy + (Math.random() - 0.5) * 50,
        radius: Math.max(8, b.radius * 0.97),
        hue,
        alive: true,
        trail: [],
      });
      b.x -= jitterX * 0.6;
      b.y -= jitterY * 0.6;
      b.vx = -spread;
      b.vy += (Math.random() - 0.5) * 50;
      b.radius = Math.max(8, b.radius * 0.97);
      b.hue = hue;
    }
  }

  handleResize() {
    // Cap DPR at 1.5 for perf
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
  }

  // -------- internal --------
  private reset() {
    this.stop();
    this.balls = [];
    this.barriers = [];
    this.particles = [];
    this.score = 0;
    this.elapsedMs = 0;
    this.spawnTimer = 0;
    this.graceUntil = 0;
    this.pausedAt = 0;
  }

  private spawnInitialBall() {
    this.balls.push({
      x: this.width / 2,
      y: this.height * 0.25,
      vx: 0,
      vy: 0,
      radius: 12,
      hue: HUES[0],
      alive: true,
      trail: [],
    });
  }

  private currentDifficulty() {
    const t = this.elapsedMs / 1000;
    return Math.min(0.85, t / 150); // gentler ramp
  }

  private spawnBarrier() {
    const diff = this.currentDifficulty();
    // Gap shrinks slowly: 38% → 18%
    const gapWidth = 0.38 - diff * 0.20;
    const start = Math.random() * (1 - gapWidth);
    const speed = 90 + diff * 80; // px/s upward
    this.barriers.push({
      y: this.height + 20,
      height: 18,
      gap: { start, end: start + gapWidth },
      hue: HUES[Math.floor(Math.random() * HUES.length)],
      passed: false,
      speed,
    });
  }

  private spawnParticles(x: number, y: number, hue: number, count: number) {
    const room = GameEngine.MAX_PARTICLES - this.particles.length;
    const n = Math.min(count, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.5,
        maxLife: 0.5,
        hue,
      });
    }
  }

  private loop = (ts: number) => {
    this.rafId = requestAnimationFrame(this.loop);

    // Countdown
    if (this.state === "countdown") {
      this.lastTs = ts;
      if (ts >= this.countdownEndsAt) {
        this.state = "playing";
        this.startTs = ts;
      }
      this.render(ts);
      this.maybeEmitStats();
      return;
    }

    if (this.state === "paused" || this.state === "over" || this.state === "ready") {
      this.lastTs = ts;
      this.render(ts);
      return;
    }

    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    if (dt > 0.05) dt = 0.05; // clamp big frame skips
    this.elapsedMs += dt * 1000;

    this.update(dt, ts);
    this.render(ts);
    this.maybeEmitStats();
  };

  private update(dt: number, ts: number) {
    // Spawn barriers
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnIn) {
      this.spawnTimer = 0;
      const diff = this.currentDifficulty();
      this.nextSpawnIn = 1.5 - diff * 0.7; // 1.5s → 0.8s
      this.spawnBarrier();
    }

    // Update balls (gravity-light: balls hover near top, scroll happens via barriers moving up)
    const playZoneTop = this.height * 0.25;
    const playZoneBottom = this.height * 0.55;
    for (const b of this.balls) {
      if (!b.alive) continue;
      // Trail
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > GameEngine.TRAIL_LEN) b.trail.shift();
      // Horizontal motion
      b.x += b.vx * dt;
      b.vx *= 0.97; // lighter damping so balls keep separation
      // Keep within play zone vertically (gentle spring)
      const targetY = (playZoneTop + playZoneBottom) / 2;
      b.vy += (targetY - b.y) * 2 * dt;
      b.vy *= 0.95;
      b.y += b.vy * dt;
      // Wall bounce
      if (b.x < b.radius) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * 0.6;
      } else if (b.x > this.width - b.radius) {
        b.x = this.width - b.radius;
        b.vx = -Math.abs(b.vx) * 0.6;
      }
    }

    // Cleanup dead balls (keep array small)
    if (this.balls.length > 16 && this.balls.some((b) => !b.alive)) {
      this.balls = this.balls.filter((b) => b.alive);
    }

    // Update barriers + collisions
    const aliveBefore = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const bar = this.barriers[i];
      bar.y -= bar.speed * dt;
      const top = bar.y;
      const bottom = bar.y + bar.height;

      for (const b of this.balls) {
        if (!b.alive) continue;
        if (b.y + b.radius >= top && b.y - b.radius <= bottom) {
          if (ts < this.graceUntil) continue;
          const nx = b.x / this.width;
          const inGap = nx >= bar.gap.start + 0.005 && nx <= bar.gap.end - 0.005;
          if (!inGap) {
            b.alive = false;
            this.spawnParticles(b.x, b.y, b.hue, 12);
            haptic(hapticPatterns.hit);
          }
        }
      }

      // Score on pass
      if (bar.y + bar.height < this.height * 0.25 - 20 && !bar.passed) {
        bar.passed = true;
        const aliveNow = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
        if (aliveNow > 0) {
          this.score += aliveNow;
          sfx.pass(aliveNow);
        }
      }

      // Remove off-screen
      if (bar.y + bar.height < -40) this.barriers.splice(i, 1);
    }
    void aliveBefore;

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    // Game over check
    const aliveAfter = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
    if (aliveAfter === 0) {
      this.state = "over";
      sfx.gameOver();
      this.cb.onGameOver(this.snapshot());
    }
  }

  private render(ts: number) {
    const c = this.ctx;
    // Clear
    c.fillStyle = "hsl(230, 30%, 6%)";
    c.fillRect(0, 0, this.width, this.height);

    // Subtle play-zone marker
    c.strokeStyle = "hsla(180, 50%, 50%, 0.1)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, this.height * 0.25);
    c.lineTo(this.width, this.height * 0.25);
    c.stroke();

    // Barriers
    c.globalCompositeOperation = "source-over";
    for (const bar of this.barriers) {
      const gx1 = bar.gap.start * this.width;
      const gx2 = bar.gap.end * this.width;
      c.fillStyle = `hsl(${bar.hue}, 100%, 55%)`;
      // Left segment
      c.fillRect(0, bar.y, gx1, bar.height);
      // Right segment
      c.fillRect(gx2, bar.y, this.width - gx2, bar.height);
      // Glow line
      c.fillStyle = `hsla(${bar.hue}, 100%, 75%, 0.4)`;
      c.fillRect(0, bar.y - 1, gx1, 2);
      c.fillRect(gx2, bar.y - 1, this.width - gx2, 2);
    }

    // Particles
    c.globalCompositeOperation = "lighter";
    for (const p of this.particles) {
      const a = p.life / p.maxLife;
      c.fillStyle = `hsla(${p.hue}, 100%, 70%, ${a})`;
      c.beginPath();
      c.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      c.fill();
    }

    // Trails
    for (const b of this.balls) {
      if (!b.alive) continue;
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        const a = (i + 1) / (b.trail.length + 1) * 0.4;
        const r = b.radius * (0.5 + (i / b.trail.length) * 0.5);
        c.fillStyle = `hsla(${b.hue}, 100%, 70%, ${a})`;
        c.beginPath();
        c.arc(t.x, t.y, r, 0, Math.PI * 2);
        c.fill();
      }
    }

    // Balls
    for (const b of this.balls) {
      if (!b.alive) continue;
      const sprite = this.ballSprites.get(b.hue) || this.ballSprites.get(HUES[0])!;
      const drawSize = b.radius * 3.5;
      c.drawImage(sprite, b.x - drawSize / 2, b.y - drawSize / 2, drawSize, drawSize);
    }
    c.globalCompositeOperation = "source-over";
    void ts;
  }

  private snapshot(): PublicGameStats {
    const now = performance.now();
    let countdown: number | null = null;
    if (this.state === "countdown") {
      const remaining = Math.max(0, this.countdownEndsAt - now);
      countdown = Math.ceil(remaining / 1000);
      if (countdown > 3) countdown = 3;
    }
    const alive = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
    return {
      score: this.score,
      alive: Math.max(1, alive),
      state: this.state,
      durationSeconds: Math.floor(this.elapsedMs / 1000),
      countdown,
    };
  }

  private maybeEmitStats() {
    const now = performance.now();
    if (now - this.lastEmitTs < 100) return;
    this.lastEmitTs = now;
    this.cb.onStatsChange(this.snapshot());
  }

  private emitStats() {
    this.cb.onStatsChange(this.snapshot());
  }
}
