import { sfx, haptic, hapticPatterns } from "./audio";
import type { RoundScript } from "./economy/multiplierTable";
import { getDifficultySnapshot } from "./difficulty";
import { multiplierForBarriers } from "./economy/multiplierCurve";
import { calculateZones } from "./economy/zoneCalculator";
import {
  buildLayoutRow,
  hashSeed,
  mulberry32,
  PHASE2_SPEED_CEIL,
  type LayoutBarrier,
} from "./economy/liveDeterministicLayout";

// Neon Split — engine com combo, power-ups, eventos por onda, score popups, shake e slow-mo.

export type GameState = "ready" | "countdown" | "playing" | "paused" | "over";

export interface PublicGameStats {
  score: number;
  alive: number;
  state: GameState;
  durationSeconds: number;
  countdown: number | null;
  combo: number;
  shieldActive: boolean;
  ghostCharges: number;
  multiplierUntilSec: number; // 0 if inactive
  currentMultiplier?: number;
  currentZone?: number;
  nextZoneThreshold?: number;
  barriersPassed?: number;
}

export interface RoundSummaryOut {
  score: number;
  durationSeconds: number;
  maxCombo: number;
  maxAlive: number;
  splits: number;
  powerupsCollected: number;
  /** Barreiras cuja linha de pontuação foi ultrapassada (modo revelação). */
  barriersPassed?: number;
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
  prevY: number;
  prevX: number;
}

interface Barrier {
  y: number;
  height: number;
  gaps: { start: number; end: number }[];
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

interface ScorePopup {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

type PowerupKind = "shield" | "ghost" | "multi" | "xp";

interface Powerup {
  x: number;
  y: number;
  vy: number;
  kind: PowerupKind;
  radius: number;
  alive: boolean;
  pulse: number;
}

const HUES = [180, 320, 55, 140, 270, 25];

interface EngineCallbacks {
  onStatsChange: (stats: PublicGameStats) => void;
  onGameOver: (stats: PublicGameStats, summary: RoundSummaryOut) => void;
}

interface ScriptTerminateInputs {
  script: RoundScript | null;
  allowScriptTerminate: boolean;
  state: GameState;
  aliveAfter: number;
  elapsedSec: number;
  barriersPassedCount: number;
  score: number;
}

/**
 * @deprecated Fase 1 do payout dinâmico: o engine não termina mais a rodada por
 * meta de barreiras/score/tempo. Game over agora só ocorre quando todas as bolas morrem.
 * Mantido como no-op para compatibilidade com testes existentes.
 */
export function shouldTerminateScriptRound(_input: ScriptTerminateInputs): boolean {
  return false;
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
  private popups: ScorePopup[] = [];
  private powerups: Powerup[] = [];

  private score = 0;
  private state: GameState = "ready";
  private rafId: number | null = null;
  private lastTs = 0;
  private startTs = 0;
  private elapsedMs = 0;
  private lastEmitTs = 0;

  private spawnTimer = 0;
  private nextSpawnIn = 0;
  private powerupTimer = 0;
  private nextPowerupIn = 7;

  private graceUntil = 0;

  // Combo
  private combo = 0;
  private maxCombo = 0;
  // Round stats
  private maxAlive = 1;
  private splitsCount = 0;
  private powerupsCollected = 0;

  // Power-up effects
  private shieldActive = false;
  private ghostCharges = 0;
  private multiplierUntilMs = 0;

  // FX
  private shakeUntil = 0;
  private shakeMag = 0;
  private slowMoUntil = 0;
  private flashUntil = 0;

  private static readonly MAX_BALLS = 128;
  private static readonly TRAIL_LEN = 4;
  private static readonly MAX_PARTICLES = 60;
  private static readonly COUNTDOWN_MS = 3000;

  private countdownEndsAt = 0;
  private pausedAt = 0;

  private ballSprites = new Map<number, HTMLCanvasElement>();
  private static readonly SPRITE_R = 28;

  private cb: EngineCallbacks;

  /** Rodada servidor-first: encerra quando metas visuais forem atingidas. */
  private script: RoundScript | null = null;
  private allowScriptTerminate = true;
  private barriersPassedCount = 0;
  private mode: "demo" | "live" = "demo";
  private targetBarrier = 0;
  private finalMultiplier = 0;
  private currentClimbMultiplier = 0;
  private layoutPlan: LayoutBarrier[] | null = null;
  private layoutCursor = 0;

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
  start(opts?: {
    script?: RoundScript | null;
    allowScriptTerminate?: boolean;
    mode?: "demo" | "live";
    targetBarrier?: number;
    finalMultiplier?: number;
    layoutPlan?: LayoutBarrier[] | null;
    layoutSeed?: string | null;
  }) {
    this.script = opts?.script ?? null;
    this.allowScriptTerminate = opts?.allowScriptTerminate ?? true;
    this.mode = opts?.mode ?? "demo";
    this.targetBarrier = Math.max(0, opts?.targetBarrier ?? this.script?.barriers_crossed ?? 0);
    this.finalMultiplier = Math.max(0, opts?.finalMultiplier ?? 0);
    this.currentClimbMultiplier = 0;
    this.layoutPlan = opts?.layoutPlan ?? null;
    this.layoutCursor = 0;
    this.layoutSeed = opts?.layoutSeed ?? null;
    // RNG procedural para a Fase 2 (quando o jogador excede o `layoutPlan`).
    this.proceduralRng = this.layoutSeed
      ? mulberry32(hashSeed(`${this.layoutSeed}::phase2`))
      : null;
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
    this.shakeUntil += delta;
    this.slowMoUntil += delta;
    this.multiplierUntilMs += delta;
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
    this.splitsCount += splitCount;
    this.graceUntil = ts + 90;
    if (alive.length >= 8) this.flashUntil = ts + 90;
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
        prevX: b.x + jitterX,
        prevY: b.y + jitterY,
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
    this.popups = [];
    this.powerups = [];
    this.score = 0;
    this.elapsedMs = 0;
    this.spawnTimer = 0;
    this.powerupTimer = 0;
    this.nextPowerupIn = 6 + Math.random() * 4;
    this.graceUntil = 0;
    this.pausedAt = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.maxAlive = 1;
    this.splitsCount = 0;
    this.powerupsCollected = 0;
    this.barriersPassedCount = 0;
    this.shieldActive = false;
    this.ghostCharges = 0;
    this.multiplierUntilMs = 0;
    this.shakeUntil = 0;
    this.slowMoUntil = 0;
    this.flashUntil = 0;
    this.currentClimbMultiplier = 0;
    this.layoutCursor = 0;
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
      prevX: this.width / 2,
      prevY: this.height * 0.25,
    });
  }

  private currentDifficulty() {
    return getDifficultySnapshot(this.elapsedMs).value;
  }

  private spawnBarrier() {
    // Cor única (verde neon) para todas as barreiras — nada de cor por zona.
    const NEON_HUE = 140;

    if (this.mode === "live" && this.layoutPlan && this.layoutCursor < this.layoutPlan.length) {
      const row = this.layoutPlan[this.layoutCursor++];
      const start = Math.max(0.01, Math.min(0.95, row.gapPosition));
      const end = Math.min(0.99, start + row.gapSize);
      this.barriers.push({
        y: this.height + 20,
        height: 18,
        gaps: [{ start, end }],
        hue: NEON_HUE,
        passed: false,
        speed: row.speed,
      });
      return;
    }

    // DEMO skill puro: barreiras fáceis e generosas (gap 30-50%, vel 50-170).
    if (this.mode === "demo") {
      const idx = this.barriersPassedCount + this.barriers.length;
      const difficulty = Math.min(0.40, 0.15 + idx * 0.008);
      // gap entre 50% (fácil) e 30% (médio)
      const t = difficulty / 0.40;
      const gapSize = 0.50 - (0.50 - 0.30) * t;
      const start = Math.max(0.01, Math.random() * (1 - gapSize));
      const speed = Math.min(170, 50 + idx * 1.2);
      this.barriers.push({
        y: this.height + 20,
        height: 18,
        gaps: [{ start, end: start + gapSize }],
        hue: NEON_HUE,
        passed: false,
        speed,
      });
      return;
    }

    // Fallback (modo live sem layoutPlan e sem script): comportamento legado simplificado.
    const diff = this.currentDifficulty();
    const speed = 90 + diff * 80;
    const gapWidth = 0.38 - diff * 0.20;
    const start = Math.random() * (1 - gapWidth);
    this.barriers.push({
      y: this.height + 20,
      height: 18,
      gaps: [{ start, end: start + gapWidth }],
      hue: NEON_HUE,
      passed: false,
      speed,
    });
  }

  private spawnPowerup() {
    const kinds: PowerupKind[] = ["shield", "ghost", "multi", "xp", "xp"];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.powerups.push({
      x: 30 + Math.random() * (this.width - 60),
      y: this.height + 20,
      vy: -120,
      kind,
      radius: 14,
      alive: true,
      pulse: 0,
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

  private addPopup(x: number, y: number, text: string, hue: number, size = 22, life = 0.9) {
    if (this.popups.length > 18) this.popups.shift();
    this.popups.push({ x, y, text, life, maxLife: life, hue, size });
  }

  private loop = (ts: number) => {
    this.rafId = requestAnimationFrame(this.loop);

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
    if (dt > 0.05) dt = 0.05;
    // Slow-mo
    if (ts < this.slowMoUntil) dt *= 0.4;
    this.elapsedMs += dt * 1000;

    this.update(dt, ts);
    this.render(ts);
    this.maybeEmitStats();
  };

  private update(dt: number, ts: number) {
    // Spawn barriers
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.nextSpawnIn) {
      this.spawnTimer -= this.nextSpawnIn;
      const difficulty = getDifficultySnapshot(this.elapsedMs);
      this.nextSpawnIn = difficulty.barrierSpawnEverySec;
      this.spawnBarrier();
    }

    // Spawn power-ups (desativado no modo revelação para reduzir variância)
    if (!this.script) {
      this.powerupTimer += dt;
      if (this.powerupTimer >= this.nextPowerupIn) {
        this.powerupTimer -= this.nextPowerupIn;
        this.nextPowerupIn = 8 + Math.random() * 6;
        this.spawnPowerup();
      }
    }

    // Update balls
    const playZoneTop = this.height * 0.25;
    const playZoneBottom = this.height * 0.55;
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > GameEngine.TRAIL_LEN) b.trail.shift();
      b.prevX = b.x;
      b.prevY = b.y;
      b.x += b.vx * dt;
      b.vx *= 0.97;
      const targetY = (playZoneTop + playZoneBottom) / 2;
      b.vy += (targetY - b.y) * 2 * dt;
      b.vy *= 0.95;
      b.y += b.vy * dt;
      if (b.x < b.radius) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * 0.6;
      } else if (b.x > this.width - b.radius) {
        b.x = this.width - b.radius;
        b.vx = -Math.abs(b.vx) * 0.6;
      }
    }

    // Ball-ball separation
    const aliveBalls = this.balls.filter((b) => b.alive);
    for (let i = 0; i < aliveBalls.length; i++) {
      for (let j = i + 1; j < aliveBalls.length; j++) {
        const a = aliveBalls[i];
        const b = aliveBalls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = (a.radius + b.radius) * 1.15;
        const distSq = dx * dx + dy * dy;
        if (distSq <= 0 || distSq >= minDist * minDist) continue;
        const dist = Math.sqrt(distSq);
        const push = (minDist - dist) * 0.35;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        a.vx -= nx * 18;
        b.vx += nx * 18;
      }
    }

    if (this.balls.length > 16 && this.balls.some((b) => !b.alive)) {
      this.balls = this.balls.filter((b) => b.alive);
    }

    // Update power-ups
    for (const p of this.powerups) {
      if (!p.alive) continue;
      p.y += p.vy * dt;
      p.pulse += dt;
      // Collision with any alive ball
      for (const b of this.balls) {
        if (!b.alive) continue;
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        if (dx * dx + dy * dy <= (b.radius + p.radius) * (b.radius + p.radius)) {
          p.alive = false;
          this.collectPowerup(p, ts);
          break;
        }
      }
      if (p.y < -30) p.alive = false;
    }
    if (this.powerups.length > 8) this.powerups = this.powerups.filter((p) => p.alive);

    // Update barriers + collisions
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      const bar = this.barriers[i];
      const prevBarY = bar.y;
      bar.y -= bar.speed * dt;
      const top = bar.y;
      const bottom = bar.y + bar.height;
      const prevTop = prevBarY;
      const prevBottom = prevBarY + bar.height;

      for (const b of this.balls) {
        if (!b.alive) continue;
        const ballMinNow = b.y - b.radius;
        const ballMaxNow = b.y + b.radius;
        const ballMinPrev = b.prevY - b.radius;
        const ballMaxPrev = b.prevY + b.radius;
        const ballMin = Math.min(ballMinNow, ballMinPrev);
        const ballMax = Math.max(ballMaxNow, ballMaxPrev);
        const barMin = Math.min(top, prevTop);
        const barMax = Math.max(bottom, prevBottom);
        if (ballMax >= barMin && ballMin <= barMax) {
          if (ts < this.graceUntil) continue;
          const midX = (b.x + b.prevX) * 0.5;
          const nx = midX / this.width;
          const inGap = bar.gaps.some((g) => nx >= g.start + 0.005 && nx <= g.end - 0.005);
          if (!inGap) {
            // Shield first
            if (this.shieldActive) {
              this.shieldActive = false;
              this.spawnParticles(b.x, b.y, 180, 10);
              this.addPopup(b.x, b.y - 20, "ESCUDO!", 180, 18);
              continue;
            }
            if (this.ghostCharges > 0) {
              this.ghostCharges--;
              this.spawnParticles(b.x, b.y, 270, 8);
              this.addPopup(b.x, b.y - 20, "FANTASMA!", 270, 16);
              continue;
            }
            b.alive = false;
            this.spawnParticles(b.x, b.y, b.hue, 12);
            haptic(hapticPatterns.hit);
            // Break combo
            if (this.combo > 0) {
              this.combo = 0;
            }
            // Shake
            this.shakeUntil = ts + 140;
            this.shakeMag = 5;
          }
        }
      }

      if (bar.y + bar.height < this.height * 0.25 - 20 && !bar.passed) {
        bar.passed = true;
        this.barriersPassedCount += 1;
        const aliveNow = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
        if (aliveNow > 0) {
          const prevCombo = this.combo;
          this.combo += 1;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
          const multActive = ts < this.multiplierUntilMs;
          const mult = multActive ? 2 : 1;
          // Combo tier score bonus
          const comboMult = this.combo >= 30 ? 2.0 : this.combo >= 20 ? 1.5 : this.combo >= 10 ? 1.25 : this.combo >= 5 ? 1.1 : 1.0;
          const gained = Math.ceil(aliveNow * mult * comboMult);
          this.score += gained;
          sfx.pass(aliveNow + Math.min(this.combo, 12));
          // Milestone popup when crossing a combo tier
          const milestones = [5, 10, 20, 30] as const;
          const hit = milestones.find((m) => prevCombo < m && this.combo >= m);
          if (hit) {
            const mHue = hit >= 30 ? 300 : hit >= 20 ? 30 : hit >= 10 ? 55 : 140;
            this.addPopup(this.width / 2, this.height * 0.38, `COMBO x${hit}!`, mHue, 32, 1.4);
            this.flashUntil = ts + 140;
          }
          // Popup at center top of play zone, near a random alive ball
          const sample = this.balls.find((b) => b.alive)!;
          this.addPopup(sample.x, sample.y - 28, `+${gained}${mult > 1 ? " x2" : ""}`, multActive ? 55 : 180, 20);
          // Slow-mo trigger when only 1 ball survives a tight pass
          if (aliveNow === 1 && this.combo >= 3) this.slowMoUntil = ts + 160;
        }
      }

      if (bar.y + bar.height < -40) this.barriers.splice(i, 1);
    }

    // Particles
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

    // Popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.y -= 35 * dt;
      if (p.life <= 0) this.popups.splice(i, 1);
    }

    // Track maxAlive
    let aliveAfter = this.balls.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
    if (aliveAfter > this.maxAlive) this.maxAlive = aliveAfter;
    // Multiplicador efetivo da rodada — vem da curva pública m(b).
    // Tier sorteado e targetBarrier viram só referência informativa.
    this.currentClimbMultiplier = multiplierForBarriers(this.barriersPassedCount);

    // Sem terminação forçada — Fase 1 do payout dinâmico.
    // Game over só quando todas as bolas morrem (verificado abaixo).

    if (aliveAfter === 0) {
      this.state = "over";
      sfx.gameOver();
      const summary: RoundSummaryOut = {
        score: this.score,
        durationSeconds: Math.floor(this.elapsedMs / 1000),
        maxCombo: this.maxCombo,
        maxAlive: this.maxAlive,
        splits: this.splitsCount,
        powerupsCollected: this.powerupsCollected,
        barriersPassed: this.barriersPassedCount,
      };
      this.cb.onGameOver(this.snapshot(), summary);
    }
  }

  /** Encerra a rodada imediatamente (revelação alinhada ao servidor). */
  private forceTerminateRound(ts: number) {
    for (const b of this.balls) {
      if (!b.alive) continue;
      b.alive = false;
      this.spawnParticles(b.x, b.y, b.hue, 10);
    }
    this.shakeUntil = ts + 100;
    this.shakeMag = 4;
  }

  private collectPowerup(p: Powerup, ts: number) {
    this.powerupsCollected++;
    sfx.split();
    haptic(hapticPatterns.tap);
    if (p.kind === "shield") {
      this.shieldActive = true;
      this.addPopup(p.x, p.y - 20, "ESCUDO", 180, 20);
      this.spawnParticles(p.x, p.y, 180, 14);
    } else if (p.kind === "ghost") {
      this.ghostCharges += 1;
      this.addPopup(p.x, p.y - 20, "FANTASMA", 270, 20);
      this.spawnParticles(p.x, p.y, 270, 14);
    } else if (p.kind === "multi") {
      this.multiplierUntilMs = ts + 6000;
      this.addPopup(p.x, p.y - 20, "x2 PONTOS!", 55, 22);
      this.spawnParticles(p.x, p.y, 55, 16);
    } else if (p.kind === "xp") {
      const bonus = 10;
      this.score += bonus;
      this.addPopup(p.x, p.y - 20, `+${bonus}`, 140, 20);
      this.spawnParticles(p.x, p.y, 140, 12);
    }
  }

  private render(ts: number) {
    const c = this.ctx;

    // Shake offset
    let sx = 0, sy = 0;
    if (ts < this.shakeUntil) {
      const k = (this.shakeUntil - ts) / 140;
      sx = (Math.random() - 0.5) * this.shakeMag * 2 * k;
      sy = (Math.random() - 0.5) * this.shakeMag * 2 * k;
    }
    c.save();
    c.translate(sx, sy);

    c.fillStyle = "hsl(230, 30%, 6%)";
    c.fillRect(-10, -10, this.width + 20, this.height + 20);

    c.strokeStyle = "hsla(180, 50%, 50%, 0.1)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, this.height * 0.25);
    c.lineTo(this.width, this.height * 0.25);
    c.stroke();

    // (removido) tint de zona — sem variação visual de zona.

    // Barriers
    c.globalCompositeOperation = "source-over";
    for (const bar of this.barriers) {
      c.fillStyle = `hsl(${bar.hue}, 100%, 55%)`;
      // Build segments by sorting gaps
      const sorted = [...bar.gaps].sort((a, b) => a.start - b.start);
      let cursor = 0;
      for (const g of sorted) {
        const gx1 = g.start * this.width;
        const gx2 = g.end * this.width;
        if (gx1 > cursor) c.fillRect(cursor, bar.y, gx1 - cursor, bar.height);
        cursor = gx2;
      }
      if (cursor < this.width) c.fillRect(cursor, bar.y, this.width - cursor, bar.height);
      c.fillStyle = `hsla(${bar.hue}, 100%, 75%, 0.4)`;
      cursor = 0;
      for (const g of sorted) {
        const gx1 = g.start * this.width;
        const gx2 = g.end * this.width;
        if (gx1 > cursor) c.fillRect(cursor, bar.y - 1, gx1 - cursor, 2);
        cursor = gx2;
      }
      if (cursor < this.width) c.fillRect(cursor, bar.y - 1, this.width - cursor, 2);
    }

    // Power-ups
    c.globalCompositeOperation = "lighter";
    for (const p of this.powerups) {
      if (!p.alive) continue;
      const hue = p.kind === "shield" ? 180 : p.kind === "ghost" ? 270 : p.kind === "multi" ? 55 : 140;
      const pulse = 1 + Math.sin(p.pulse * 6) * 0.15;
      const r = p.radius * pulse;
      const grad = c.createRadialGradient(p.x, p.y, 1, p.x, p.y, r * 2);
      grad.addColorStop(0, `hsla(${hue}, 100%, 90%, 1)`);
      grad.addColorStop(0.5, `hsla(${hue}, 100%, 60%, 0.6)`);
      grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
      c.fillStyle = grad;
      c.beginPath();
      c.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
      c.fill();
      // Letter
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "white";
      c.font = "bold 14px Inter, system-ui, sans-serif";
      const letter = p.kind === "shield" ? "S" : p.kind === "ghost" ? "G" : p.kind === "multi" ? "×2" : "+";
      c.fillText(letter, p.x, p.y);
      c.globalCompositeOperation = "lighter";
    }

    // Particles
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
      // Shield ring
      if (this.shieldActive) {
        c.strokeStyle = `hsla(180, 100%, 70%, ${0.6 + Math.sin(ts / 100) * 0.2})`;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
        c.stroke();
      }
      if (this.ghostCharges > 0) {
        c.strokeStyle = `hsla(270, 100%, 75%, ${0.5 + Math.sin(ts / 120) * 0.2})`;
        c.lineWidth = 1.5;
        c.setLineDash([3, 3]);
        c.beginPath();
        c.arc(b.x, b.y, b.radius + 7, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }
    c.globalCompositeOperation = "source-over";

    // Score popups
    for (const p of this.popups) {
      const a = Math.min(1, p.life / p.maxLife * 1.5);
      c.fillStyle = `hsla(${p.hue}, 100%, 75%, ${a})`;
      c.font = `bold ${p.size}px Inter, system-ui, sans-serif`;
      c.shadowColor = `hsl(${p.hue}, 100%, 60%)`;
      c.shadowBlur = p.size >= 28 ? 18 : 8;
      c.fillText(p.text, p.x, p.y);
      c.shadowBlur = 0;
    }

    // Combo display
    if (this.combo >= 3 && this.state === "playing") {
      const hue = this.combo >= 30 ? 300 : this.combo >= 20 ? 30 : this.combo >= 10 ? 55 : this.combo >= 5 ? 140 : 180;
      const fontSize = Math.round(22 + Math.min(this.combo, 30) * 0.47);
      const pulseMag = this.combo >= 10 ? 0.09 : 0.05;
      const blurSize = this.combo >= 20 ? 24 : this.combo >= 10 ? 18 : 12;
      const scale = 1 + Math.sin(ts / 120) * pulseMag;
      c.save();
      c.translate(this.width / 2, this.height * 0.15);
      c.scale(scale, scale);
      c.fillStyle = `hsla(${hue}, 100%, 75%, 0.95)`;
      c.shadowColor = `hsl(${hue}, 100%, 60%)`;
      c.shadowBlur = blurSize;
      c.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
      c.fillText(`COMBO ×${this.combo}`, 0, 0);
      c.shadowBlur = 0;
      c.restore();
    }

    // Multiplier indicator
    if (ts < this.multiplierUntilMs && this.state === "playing") {
      const remain = (this.multiplierUntilMs - ts) / 1000;
      c.fillStyle = "hsla(55, 100%, 70%, 0.9)";
      c.font = "bold 14px Inter, system-ui, sans-serif";
      c.shadowColor = "hsl(55, 100%, 60%)";
      c.shadowBlur = 8;
      c.fillText(`×2 PONTOS  ${remain.toFixed(1)}s`, this.width / 2, this.height - 24);
      c.shadowBlur = 0;
    }

    c.restore();

    // Flash overlay (no shake)
    if (ts < this.flashUntil) {
      const a = (this.flashUntil - ts) / 90 * 0.25;
      c.fillStyle = `rgba(255,255,255,${a})`;
      c.fillRect(0, 0, this.width, this.height);
    }
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
    const zones = calculateZones();
    const z =
      zones.find((it) => this.currentClimbMultiplier >= it.minMultiplier && this.currentClimbMultiplier <= it.maxMultiplier) ??
      zones[zones.length - 1];
    const next = zones[Math.min(z.index + 1, zones.length - 1)];
    return {
      score: this.score,
      alive,
      state: this.state,
      durationSeconds: Math.floor(this.elapsedMs / 1000),
      countdown,
      combo: this.combo,
      shieldActive: this.shieldActive,
      ghostCharges: this.ghostCharges,
      multiplierUntilSec: Math.max(0, (this.multiplierUntilMs - now) / 1000),
      currentMultiplier: this.currentClimbMultiplier,
      currentZone: z.index + 1,
      nextZoneThreshold: next.minMultiplier,
      barriersPassed: this.barriersPassedCount,
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
