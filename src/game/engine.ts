import { sfx } from "./audio";

// ============================================================================
// Neon Split — Game Engine
// ============================================================================
// Vertical scrolling tunnel. Player taps to split balls. Balls fall and must
// pass through gaps in horizontal barriers that scroll up toward them.
// ----------------------------------------------------------------------------

export type GameState = "ready" | "playing" | "over";

export interface PublicGameStats {
  score: number;
  multiplier: number; // current alive balls
  maxMultiplier: number;
  alive: number;
  state: GameState;
  durationSeconds: number;
  combo: number;
  comboMultiplier: number;
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

const HUES = [180, 320, 55, 140, 270, 25];

interface EngineCallbacks {
  onStatsChange: (stats: PublicGameStats) => void;
  onGameOver: (stats: PublicGameStats) => void;
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

  private cb: EngineCallbacks;

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.cb = cb;
    this.handleResize();
  }

  // ---------------- public API ----------------
  start() {
    this.reset();
    this.state = "playing";
    this.startTs = performance.now();
    this.lastTs = this.startTs;
    this.spawnInitialBall();
    this.nextSpawnIn = 1.1;
    this.powerupTimer = 4;
    this.emitStats();
    this.loop(this.lastTs);
  }

  stop() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /** User tapped — split all alive balls in two */
  tap() {
    if (this.state !== "playing") return;
    const alive = this.balls.filter((b) => b.alive);
    if (alive.length === 0) return;
    if (alive.length >= 256) return; // safety cap
    sfx.split();
    const ts = performance.now();
    // Brief grace window so a tap doesn't insta-kill mid-barrier
    this.graceUntil = ts + 90;
    const hue = HUES[Math.min(Math.floor(Math.log2(alive.length * 2)), HUES.length - 1)];
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
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    this.graceUntil = 0;
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
      shielded: false,
      trail: [],
    });
  }

  private currentDifficulty() {
    // 0..1 grows with time, capped — faster ramp for more tension
    const t = this.elapsedMs / 1000;
    return Math.min(1, t / 60);
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
    const hue = HUES[Math.floor(Math.random() * HUES.length)];
    this.barriers.push({
      y: this.height + 20,
      height,
      gaps,
      hue,
      passed: false,
      speed,
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
    if (this.state !== "playing") return;
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

    // Spawn powerups occasionally
    this.powerupTimer -= dt;
    if (this.powerupTimer <= 0) {
      this.spawnPowerup();
      this.powerupTimer = 7 + Math.random() * 6;
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

    // Update balls
    const aliveBefore = this.balls.filter((b) => b.alive).length;
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

      // Update trail
      b.trail.push({ x: b.x, y: b.y, a: 1 });
      if (b.trail.length > 8) b.trail.shift();
      for (const t of b.trail) t.a *= 0.85;
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
            if (b.shielded) {
              b.shielded = false;
              this.spawnParticles(b.x, b.y, b.hue, 10);
            } else {
              b.alive = false;
              sfx.hit();
              this.spawnParticles(b.x, b.y, b.hue, 22);
              this.shakeUntil = ts + 220;
              this.shakeIntensity = 6;
            }
          }
        }
      }

      // When barrier fully scrolled past the band of balls, mark passed and award
      if (bar.y + bar.height < this.height * 0.4 - 30 && !bar.passed) {
        bar.passed = true;
        const aliveNow = this.balls.filter((b) => b.alive).length;
        if (aliveNow > 0) {
          const gained = aliveNow; // 1 point per alive ball
          this.score += gained;
          sfx.pass(aliveNow);
          // Perfect pass bonus if no losses on this barrier (all still alive)
          if (aliveNow === aliveBefore && aliveNow >= 4) {
            this.score += aliveNow; // double
            sfx.perfect();
            this.flashUntil = ts + 120;
          }
        }
      }
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

    // Cleanup off-screen
    this.barriers = this.barriers.filter((b) => b.y + b.height > -20);
    this.powerups = this.powerups.filter((p) => !p.collected && p.y > -30);

    // Particles
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);

    // Track multiplier
    const aliveAfter = this.balls.filter((b) => b.alive).length;
    if (aliveAfter > this.maxMultiplier) this.maxMultiplier = aliveAfter;

    // Game over
    if (aliveAfter === 0 && this.balls.length > 0) {
      this.state = "over";
      sfx.gameOver();
      const stats = this.snapshot();
      this.cb.onGameOver(stats);
      return;
    }

    this.emitStats();
  }

  private snapshot(): PublicGameStats {
    const alive = this.balls.filter((b) => b.alive).length;
    return {
      score: this.score,
      multiplier: alive,
      maxMultiplier: this.maxMultiplier,
      alive,
      state: this.state,
      durationSeconds: Math.floor(this.elapsedMs / 1000),
    };
  }

  private emitStats() {
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

    // Player band marker (subtle)
    const bandY = H * 0.4;
    c.strokeStyle = "hsla(180, 100%, 60%, 0.08)";
    c.setLineDash([6, 8]);
    c.beginPath();
    c.moveTo(0, bandY);
    c.lineTo(W, bandY);
    c.stroke();
    c.setLineDash([]);

    // Slowmo overlay tint
    if (ts < this.slowMoUntil) {
      c.fillStyle = "hsla(270, 100%, 50%, 0.07)";
      c.fillRect(0, 0, W, H);
    }

    // Barriers
    for (const bar of this.barriers) {
      this.drawBarrier(c, bar, W);
    }

    // Powerups
    for (const p of this.powerups) {
      if (p.collected) continue;
      this.drawPowerup(c, p, ts);
    }

    // Particles
    for (const p of this.particles) {
      const a = 1 - p.life / p.maxLife;
      c.fillStyle = `hsla(${p.hue}, 100%, 60%, ${a})`;
      c.shadowBlur = 12;
      c.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
      c.beginPath();
      c.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      c.fill();
    }
    c.shadowBlur = 0;

    // Balls
    for (const b of this.balls) {
      if (!b.alive) continue;
      // Trail
      for (const t of b.trail) {
        c.fillStyle = `hsla(${b.hue}, 100%, 65%, ${t.a * 0.3})`;
        c.beginPath();
        c.arc(t.x, t.y, b.radius * 0.7, 0, Math.PI * 2);
        c.fill();
      }
      // Glow
      c.shadowBlur = 24;
      c.shadowColor = `hsl(${b.hue}, 100%, 60%)`;
      const grad = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.radius);
      grad.addColorStop(0, `hsl(${b.hue}, 100%, 92%)`);
      grad.addColorStop(0.6, `hsl(${b.hue}, 100%, 65%)`);
      grad.addColorStop(1, `hsl(${b.hue}, 100%, 50%)`);
      c.fillStyle = grad;
      c.beginPath();
      c.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      // Shield ring
      if (b.shielded) {
        c.strokeStyle = "hsla(180, 100%, 80%, 0.9)";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(b.x, b.y, b.radius + 5, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // Flash overlay (perfect pass)
    if (ts < this.flashUntil) {
      const a = (this.flashUntil - ts) / 120;
      c.fillStyle = `hsla(0, 0%, 100%, ${a * 0.25})`;
      c.fillRect(0, 0, W, H);
    }

    c.restore();
  }

  private drawBarrier(c: CanvasRenderingContext2D, bar: Barrier, W: number) {
    const top = bar.y;
    let cursor = 0;
    const segments: [number, number][] = [];
    const sortedGaps = [...bar.gaps].sort((a, b) => a.start - b.start);
    for (const g of sortedGaps) {
      if (g.start > cursor) segments.push([cursor, g.start]);
      cursor = g.end;
    }
    if (cursor < 1) segments.push([cursor, 1]);

    c.shadowBlur = 16;
    c.shadowColor = `hsl(${bar.hue}, 100%, 60%)`;
    for (const [s, e] of segments) {
      const x = s * W;
      const w = (e - s) * W;
      const grad = c.createLinearGradient(0, top, 0, top + bar.height);
      grad.addColorStop(0, `hsl(${bar.hue}, 100%, 70%)`);
      grad.addColorStop(0.5, `hsl(${bar.hue}, 100%, 55%)`);
      grad.addColorStop(1, `hsl(${bar.hue}, 100%, 40%)`);
      c.fillStyle = grad;
      c.fillRect(x, top, w, bar.height);
      // Bright top edge
      c.fillStyle = `hsla(${bar.hue}, 100%, 90%, 0.9)`;
      c.fillRect(x, top, w, 1.5);
    }
    c.shadowBlur = 0;
  }

  private drawPowerup(c: CanvasRenderingContext2D, p: PowerUp, ts: number) {
    const hue = p.kind === "shield" ? 180 : p.kind === "slowmo" ? 270 : 55;
    const r = 14 + Math.sin(ts / 200) * 2;
    c.shadowBlur = 20;
    c.shadowColor = `hsl(${hue}, 100%, 60%)`;
    c.strokeStyle = `hsl(${hue}, 100%, 70%)`;
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = `hsla(${hue}, 100%, 90%, 0.95)`;
    c.font = "bold 14px Inter, system-ui";
    c.textAlign = "center";
    c.textBaseline = "middle";
    const letter = p.kind === "shield" ? "S" : p.kind === "slowmo" ? "T" : "M";
    c.fillText(letter, p.x, p.y + 1);
    c.shadowBlur = 0;
  }
}
