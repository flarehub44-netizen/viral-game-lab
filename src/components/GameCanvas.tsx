import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { GameEngine, type PublicGameStats } from "@/game/engine";
import { unlockAudio, isMuted, setMuted } from "@/game/audio";
import { getSelectedSkin } from "@/game/skins";
import { getDailyMod } from "@/game/daily";
import { getSettings } from "@/game/settings";
import { Volume2, VolumeX, Menu } from "lucide-react";

interface Props {
  onGameOver: (stats: PublicGameStats) => void;
  onExit: () => void;
  dailyMode?: boolean;
}

const TUTORIAL_KEY = "ns_tutorial_seen";
const BEST_KEY = "ns_best";
const MENU_HOLD_MS = 600;

const initialStats: PublicGameStats = {
  score: 0,
  multiplier: 1,
  maxMultiplier: 1,
  alive: 1,
  state: "ready",
  durationSeconds: 0,
  combo: 0,
  comboMultiplier: 1,
  comboBar: 0,
  countdown: null,
  bestPerfectStreak: 0,
  nearMisses: 0,
  pickedAnyPowerup: false,
  rushActive: false,
  rushRemaining: 0,
  bossWarning: false,
  bossesKilled: 0,
  scoreMultActive: 1,
  uniquePowerupsCollected: 0,
  mergesUsed: 0,
  superBallsActive: 0,
};

/** Pick a hue for the combo bar based on current multiplier tier. */
function comboBarHue(mult: number): number {
  if (mult >= 6) return 60;
  if (mult >= 3) return 55;
  if (mult >= 2) return 320;
  if (mult >= 1.5) return 180;
  return 200;
}

const TIPS = [
  "Toque rápido = mais bolinhas, mais pontos",
  "Tap rápido = mais bolinhas, mais pontos",
  "Combo perfeito mantém o multiplicador subindo",
  "Near-miss vale pontos extras — passe raspando!",
  "RUSH a cada 30s: 3× pontos por 10s",
  "BOSS a cada 60s: gap minúsculo, prêmio gigante",
  "Bomb limpa todas as barreiras visíveis",
  "Repel afasta as bolinhas das paredes",
];

function trailStyleForSkin(id: string): "normal" | "sparkle" | "fire" | "pixel" {
  switch (id) {
    case "solar":
      return "fire";
    case "rainbow":
      return "sparkle";
    case "void":
      return "pixel";
    default:
      return "normal";
  }
}

export const GameCanvas = ({ onGameOver, onExit, dailyMode = false }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [stats, setStats] = useState<PublicGameStats>(initialStats);
  const [muted, setMutedState] = useState(isMuted());
  const [fps, setFps] = useState(0);
  const showFps = useMemo(() => getSettings().showFps, []);
  const tip = useMemo(() => TIPS[Math.floor(Math.random() * TIPS.length)], []);

  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      const seen = localStorage.getItem(TUTORIAL_KEY) === "1";
      const best = Number(localStorage.getItem(BEST_KEY) || 0);
      return !seen || best < 50;
    } catch {
      return true;
    }
  });

  const menuHoldRef = useRef<number | null>(null);
  const menuStartRef = useRef<number>(0);
  const [menuHoldProgress, setMenuHoldProgress] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const skin = getSelectedSkin();
    const engine = new GameEngine(
      canvas,
      {
        onStatsChange: (s) => setStats(s),
        onGameOver: (s) => onGameOver(s),
      },
      {
        hues: skin.hues,
        dailyMod: dailyMode ? getDailyMod() : undefined,
        trailStyle: trailStyleForSkin(skin.id),
      },
    );
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

    const t = setTimeout(() => {
      setShowTutorial(false);
      try {
        localStorage.setItem(TUTORIAL_KEY, "1");
      } catch {}
    }, 4000);

    let fpsRaf = 0;
    if (showFps) {
      let frames = 0;
      let lastFpsTs = performance.now();
      const tick = () => {
        frames++;
        const now = performance.now();
        if (now - lastFpsTs >= 500) {
          setFps(Math.round((frames * 1000) / (now - lastFpsTs)));
          frames = 0;
          lastFpsTs = now;
        }
        fpsRaf = requestAnimationFrame(tick);
      };
      fpsRaf = requestAnimationFrame(tick);
    }

    return () => {
      clearTimeout(t);
      if (fpsRaf) cancelAnimationFrame(fpsRaf);
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

  const barHue = comboBarHue(stats.comboMultiplier);
  const showComboBar = stats.comboBar > 0.02;
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

      {/* HUD top corners — score à esquerda, bolinhas à direita, centro livre */}
      <div className="absolute top-0 left-0 right-0 p-3 flex items-start justify-between pointer-events-none">
        {/* Esquerda: menu (long-press) + score */}
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

        {/* Direita: mute + bolinhas */}
        <div className="pointer-events-auto flex items-start gap-2">
          <div className="text-right">
            <div className="text-2xl font-bold text-glow-magenta tabular-nums leading-none">
              ×{stats.multiplier}
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

      {/* Centro do topo: zona dedicada para combo + barra (não polui cantos) */}
      {stats.comboMultiplier > 1 && (
        <div className="absolute top-3 left-0 right-0 flex flex-col items-center pointer-events-none">
          <div
            className="text-xs font-bold uppercase tracking-widest animate-pulse"
            style={{ color: `hsl(${barHue}, 100%, 70%)` }}
          >
            Combo ×{stats.comboMultiplier}
          </div>
          {showComboBar && (
            <div className={`mt-1 w-32 h-1.5 rounded-full bg-card/40 border border-border overflow-hidden ${stats.comboBar < 0.25 ? "animate-pulse" : ""}`}>
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{
                  width: `${stats.comboBar * 100}%`,
                  background: stats.comboBar < 0.25
                    ? "linear-gradient(90deg, hsl(0, 100%, 55%), hsl(15, 100%, 70%))"
                    : `linear-gradient(90deg, hsl(${barHue}, 100%, 60%), hsl(${barHue}, 100%, 80%))`,
                  boxShadow: stats.comboBar < 0.25
                    ? "0 0 10px hsl(0, 100%, 55%)"
                    : `0 0 8px hsl(${barHue}, 100%, 60%)`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Rush event banner */}
      {stats.rushActive && (
        <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
          <div className="px-4 py-1 rounded-full bg-destructive/30 border border-destructive text-destructive text-xs font-black uppercase tracking-widest animate-pulse">
            🔥 RUSH ×3 · {stats.rushRemaining.toFixed(1)}s
          </div>
        </div>
      )}

      {/* Boss warning */}
      {stats.bossWarning && !stats.rushActive && (
        <div className="absolute top-16 left-0 right-0 flex justify-center pointer-events-none">
          <div className="px-4 py-1 rounded-full bg-red-500/30 border border-red-500 text-red-300 text-xs font-black uppercase tracking-widest animate-pulse">
            ⚠ BOSS APPROACHING
          </div>
        </div>
      )}

      {/* Score×2 indicator */}
      {stats.scoreMultActive > 1 && (
        <div className="absolute top-24 right-3 pointer-events-none">
          <div className="px-2 py-0.5 rounded-md bg-yellow-500/30 border border-yellow-400 text-yellow-200 text-[10px] font-black uppercase tracking-wider animate-pulse">
            ×2 SCORE
          </div>
        </div>
      )}

      {/* (super-ball badge removed) */}

      {/* Countdown overlay */}
      {isCountdown && stats.countdown != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-6">
          <div
            key={stats.countdown}
            className="text-9xl font-black text-glow-cyan tabular-nums float-up"
          >
            {stats.countdown === 0 ? "GO!" : stats.countdown}
          </div>
          <div className="px-5 py-2 max-w-xs mx-4 text-center rounded-xl bg-background/40 backdrop-blur border border-primary/30">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              💡 Dica
            </div>
            <div className="text-xs text-foreground/90">{tip}</div>
          </div>
        </div>
      )}

      {/* FPS counter */}
      {showFps && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-background/60 border border-border text-[10px] font-mono tabular-nums text-muted-foreground pointer-events-none">
          {fps} FPS
        </div>
      )}

      {/* Pause overlay */}
      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm pointer-events-none">
          <div className="text-5xl font-black text-glow-magenta">PAUSADO</div>
          <div className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Toque para continuar
          </div>
        </div>
      )}

      {/* Tutorial overlay */}
      {showTutorial && !isPaused && (
        <div className="absolute inset-x-0 bottom-24 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6 py-4 rounded-2xl bg-background/40 backdrop-blur-sm border border-primary/30 float-up">
            <div className="text-3xl mb-2 pulse-glow">👆</div>
            <div className="text-base font-bold text-glow-cyan">TOQUE PARA DIVIDIR</div>
            <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
              Mais bolinhas = mais pontos
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
