import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, type PublicGameStats, type RoundSummaryOut } from "@/game/engine";
import { unlockAudio, isMuted, setMuted } from "@/game/audio";
import { Volume2, VolumeX, Menu, Shield, Ghost } from "lucide-react";

interface Props {
  onGameOver: (stats: PublicGameStats, summary: RoundSummaryOut) => void;
  onExit: () => void;
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

export const GameCanvas = ({ onGameOver, onExit }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [stats, setStats] = useState<PublicGameStats>(initialStats);
  const [muted, setMutedState] = useState(isMuted());

  const menuHoldRef = useRef<number | null>(null);
  const menuStartRef = useRef<number>(0);
  const [menuHoldProgress, setMenuHoldProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new GameEngine(canvas, {
      onStatsChange: (s) => setStats(s),
      onGameOver: (s) => onGameOver(s),
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
    engine.start();

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <div
      className="relative w-full h-full select-none touch-none"
      onPointerDown={handleTap}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
        aria-label="Neon Split game canvas"
      />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-start justify-between pointer-events-none">
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
            <div className="text-2xl font-bold text-glow-cyan tabular-nums leading-none">
              {stats.score.toLocaleString()}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Score
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex items-start gap-2">
          <div className="text-right">
            <div className="text-2xl font-bold text-glow-magenta tabular-nums leading-none">
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
