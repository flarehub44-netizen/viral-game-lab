import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, type PublicGameStats, type RoundSummaryOut } from "@/game/engine";
import type { RoundScript } from "@/game/economy/multiplierTable";
import { unlockAudio, isMuted, setMuted } from "@/game/audio";
import { Volume2, VolumeX, Menu, Shield, Ghost } from "lucide-react";
import type { LayoutBarrier } from "@/game/economy/liveDeterministicLayout";
import { MAX_ROUND_PAYOUT } from "@/game/economy/constants";


interface FloatingWin {
  id: number;
  delta: number;
  total: number;
  barrier: number;
  createdAt: number;
}

const WIN_POPUP_TTL_MS = 1500;
const MAX_FLOATING_WINS = 6;

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  onGameOver: (stats: PublicGameStats, summary: RoundSummaryOut) => void;
  onExit: () => void;
  roundId: string;
  visualScript: RoundScript | null;
  allowScriptTerminate?: boolean;
  qaMode?: "demo" | "live";
  targetBarrier?: number;
  mode?: "demo" | "live";
  layoutPlan?: LayoutBarrier[] | null;
  stakeCredits?: number;
  /** Meta de payout (ex.: 20). */
  targetMultiplier?: number;
  /** Multiplicador já sorteado ao iniciar (HUD). */
  resultMultiplier?: number;
}

const MENU_HOLD_MS = 600;

const initialStats: PublicGameStats = {
  score: 0,
  alive: 1,
  state: "ready",
  durationSeconds: 0,
  countdown: null,
  combo: 0,
  shieldActive: false,
  ghostCharges: 0,
  multiplierUntilSec: 0,
};

export const GameCanvas = ({
  onGameOver,
  onExit,
  roundId,
  visualScript,
  allowScriptTerminate = true,
  qaMode,
  targetBarrier,
  mode = "demo",
  layoutPlan,
  stakeCredits,
  targetMultiplier,
  resultMultiplier,
}: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;
  const [stats, setStats] = useState<PublicGameStats>(initialStats);
  const [muted, setMutedState] = useState(isMuted());

  // Popups de ganho em R$ a cada barreira passada
  const [floatingWins, setFloatingWins] = useState<FloatingWin[]>([]);
  const lastBarriersRef = useRef(0);
  const lastWinningsRef = useRef(0);
  const winIdRef = useRef(0);

  const stake = stakeCredits ?? 0;
  const passedNow = stats.barriersPassed ?? 0;
  const isDemoMode = mode === "demo";

  // Meta de barreiras a atingir para receber o pagamento (skill puro).
  // DEMO: usa o targetBarrier passado pelo activeRound (mesma lógica do LIVE).
  const goalBarriers = targetBarrier ?? 0;
  const reachedGoal = goalBarriers > 0 && passedNow >= goalBarriers;
  const remainingBarriers = Math.max(0, goalBarriers - passedNow);

  // Multiplicador-alvo da rodada (já sorteado pelo servidor / demoRound)
  const roundMultiplier = resultMultiplier ?? targetMultiplier ?? 0;

  // Pagamento garantido SE atingir meta. Antes disso, é só uma promessa.
  const potentialPayout = Math.min(stake * roundMultiplier, MAX_ROUND_PAYOUT);
  const isCapped = stake * roundMultiplier >= MAX_ROUND_PAYOUT && stake > 0;

  // Popup ao passar cada barreira: mostra quantas faltam para meta (ou GANHOU!)
  useEffect(() => {
    const passed = stats.barriersPassed ?? 0;
    if (passed > lastBarriersRef.current && stake > 0) {
      lastBarriersRef.current = passed;
      lastWinningsRef.current = passed;
      winIdRef.current += 1;
      const justReached = goalBarriers > 0 && passed === goalBarriers;
      const item: FloatingWin = {
        id: winIdRef.current,
        delta: justReached ? potentialPayout : 0,
        total: potentialPayout,
        barrier: passed,
        createdAt: performance.now(),
      };
      setFloatingWins((prev) => [...prev.slice(-(MAX_FLOATING_WINS - 1)), item]);
    } else if (passed === 0 && lastBarriersRef.current !== 0) {
      lastBarriersRef.current = 0;
      lastWinningsRef.current = 0;
    }
  }, [stats.barriersPassed, potentialPayout, stake, goalBarriers]);

  // Auto-purga popups antigos
  useEffect(() => {
    if (floatingWins.length === 0) return;
    const t = window.setInterval(() => {
      const now = performance.now();
      setFloatingWins((prev) => prev.filter((w) => now - w.createdAt < WIN_POPUP_TTL_MS));
    }, 250);
    return () => window.clearInterval(t);
  }, [floatingWins.length]);

  const menuHoldRef = useRef<number | null>(null);
  const menuStartRef = useRef<number>(0);
  const [menuHoldProgress, setMenuHoldProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new GameEngine(canvas, {
      onStatsChange: (s) => setStats(s),
      onGameOver: (s, summary) => onGameOverRef.current(s, summary),
    });
    engineRef.current = engine;

    const onResize = () => engine.handleResize();
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      if (document.hidden) engine.pause();
    };
    const onBlur = () => engine.pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);

    unlockAudio();
    engine.start({
      script: visualScript ?? undefined,
      allowScriptTerminate,
      mode,
      targetBarrier,
      finalMultiplier: resultMultiplier,
      layoutPlan: layoutPlan ?? null,
    });

    return () => {
      cancelMenuHold();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      engine.stop();
      engineRef.current = null;
    };
  }, [roundId, visualScript, allowScriptTerminate, mode, targetBarrier, resultMultiplier, layoutPlan]);

  const handleTap = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      unlockAudio();
      const eng = engineRef.current;
      if (!eng) return;
      if (stats.state === "paused") {
        eng.resume();
        return;
      }
      eng.tap();
    },
    [stats.state],
  );

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const startMenuHold = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    menuStartRef.current = performance.now();
    setMenuHoldProgress(0);
    const tick = () => {
      const elapsed = performance.now() - menuStartRef.current;
      const p = Math.min(1, elapsed / MENU_HOLD_MS);
      setMenuHoldProgress(p);
      if (p >= 1) {
        cancelMenuHold();
        engineRef.current?.stop();
        onExit();
        return;
      }
      menuHoldRef.current = requestAnimationFrame(tick);
    };
    menuHoldRef.current = requestAnimationFrame(tick);
  };
  const cancelMenuHold = () => {
    if (menuHoldRef.current != null) cancelAnimationFrame(menuHoldRef.current);
    menuHoldRef.current = null;
    setMenuHoldProgress(0);
  };

  const isCountdown = stats.state === "countdown";
  const isPaused = stats.state === "paused";

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      engineRef.current?.stop();
      onExit();
      return;
    }
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    unlockAudio();
    const eng = engineRef.current;
    if (!eng) return;
    if (stats.state === "paused") {
      eng.resume();
      return;
    }
    eng.tap();
  };

  return (
    <div
      className="relative w-full h-full select-none touch-none"
      onPointerDown={handleTap}
      onKeyDown={handleKeyDown}
      role="application"
      tabIndex={0}
      aria-label="Área principal do jogo. Use toque, Enter ou Espaço para dividir."
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        aria-label="Neon Split game canvas"
      />

      {/* HUD topo */}
      <div className="absolute top-0 left-0 right-0 p-2 flex items-start justify-between gap-2 pointer-events-none">
        {/* Esquerda: menu + score */}
        <div className="flex items-start gap-2 pointer-events-auto">
          <button
            onPointerDown={startMenuHold}
            onPointerUp={cancelMenuHold}
            onPointerLeave={cancelMenuHold}
            onPointerCancel={cancelMenuHold}
            className="relative p-2 rounded-md bg-card/60 backdrop-blur border border-border text-muted-foreground hover:text-foreground overflow-hidden"
            aria-label="Segure para voltar ao menu"
            title="Segure para sair"
          >
            <Menu size={16} />
            {menuHoldProgress > 0 && (
              <span
                className="absolute inset-0 bg-destructive/40 origin-left"
                style={{ transform: `scaleX(${menuHoldProgress})` }}
              />
            )}
          </button>
          <div className="flex flex-col">
            <div className="text-lg font-bold text-glow-cyan tabular-nums leading-none">
              {stats.score.toLocaleString()}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Score
            </div>
          </div>
        </div>

        {/* Centro: Ganho atual em R$ (DEMO usa créditos fictícios, LIVE usa saldo real) */}
        {stake > 0 && (
          <div className="flex-1 flex flex-col items-center pointer-events-none" aria-live="polite">
            <div className="rounded-xl border border-[hsl(140_90%_45%/0.45)] bg-[hsl(140_45%_8%/0.78)] backdrop-blur px-3 py-1.5 min-w-[120px] text-center shadow-[0_0_18px_hsl(140_90%_45%/0.25)]">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground leading-none">
                {isDemoMode ? "Ganho (demo)" : isPreview ? "Potencial" : "Ganho atual"}
              </div>
              <div
                className={`text-2xl font-black tabular-nums leading-tight ${winColorClass}`}
                style={{ textShadow: !isPreview && rawWinnings > stake ? "0 0 12px hsl(140 90% 50% / 0.7)" : undefined }}
              >
                R$ {formatBRL(liveWinnings)}
              </div>
              <div className="text-[9px] font-semibold tracking-wide text-muted-foreground tabular-nums">
                ×{liveMultiplier.toFixed(2)} · Entrada R$ {formatBRL(stake)}
                {isCapped && <span className="ml-1 text-[hsl(30_100%_60%)]">(máx)</span>}
              </div>
            </div>
            {passedNow > 0 && (
              <div className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground tabular-nums">
                Barreiras: {passedNow}
              </div>
            )}
          </div>
        )}

        {/* Direita: bolinhas + mute */}
        <div className="pointer-events-auto flex items-start gap-2">
          <div className="flex items-center gap-1">
            {stats.shieldActive && (
              <div className="p-1.5 rounded-md bg-primary/20 border border-primary text-primary animate-pulse">
                <Shield size={14} />
              </div>
            )}
            {stats.ghostCharges > 0 && (
              <div className="p-1.5 rounded-md bg-secondary/20 border border-secondary text-secondary animate-pulse flex items-center gap-1">
                <Ghost size={14} />
                {stats.ghostCharges > 1 && (
                  <span className="text-[10px] font-bold">{stats.ghostCharges}</span>
                )}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-glow-magenta tabular-nums leading-none">
              ×{stats.alive}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Bolinhas
            </div>
          </div>
          <button
            onClick={toggleMute}
            className="p-2 rounded-md bg-card/60 backdrop-blur border border-border text-muted-foreground hover:text-foreground"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>

      {import.meta.env.DEV && qaMode && (
        <div className="absolute top-14 right-2 pointer-events-none">
          <span
            className={`inline-flex items-center rounded px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${
              qaMode === "demo"
                ? "text-[hsl(30_100%_60%)] bg-[hsl(30_60%_12%/0.72)] border border-[hsl(30_100%_45%/0.45)]"
                : "text-[hsl(140_90%_65%)] bg-[hsl(140_45%_10%/0.72)] border border-[hsl(140_90%_45%/0.45)]"
            }`}
          >
            {qaMode === "demo" ? "DEMO" : "LIVE"}
          </span>
        </div>
      )}

      {/* Popups +R$ por barreira passada */}
      <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1 z-20">
        {floatingWins.map((w) => (
          <div
            key={w.id}
            className="float-up rounded-lg border border-[hsl(140_90%_45%/0.55)] bg-[hsl(140_45%_8%/0.85)] px-3 py-1 text-center shadow-[0_0_16px_hsl(140_90%_50%/0.35)]"
          >
            <div className="text-base font-black tabular-nums text-[hsl(140_90%_62%)] leading-none">
              +R$ {formatBRL(w.delta)}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5 tabular-nums">
              Barreira {w.barrier} · Total R$ {formatBRL(w.total)}
            </div>
          </div>
        ))}
      </div>

      {/* Countdown */}
      {isCountdown && stats.countdown != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-4">
          <div
            key={stats.countdown}
            className="text-9xl font-black text-glow-cyan tabular-nums float-up"
          >
            {stats.countdown === 0 ? "GO!" : stats.countdown}
          </div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Toque para dividir
          </div>
        </div>
      )}

      {/* Pause */}
      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <div className="text-5xl font-black text-glow-magenta">PAUSADO</div>
          <div className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Toque para continuar
          </div>
        </div>
      )}
    </div>
  );
};
