import { useEffect, useRef, useState, useCallback } from "react";
import { GameEngine, type PublicGameStats } from "@/game/engine";
import { unlockAudio, isMuted, setMuted } from "@/game/audio";
import { Volume2, VolumeX } from "lucide-react";

interface Props {
  onGameOver: (stats: PublicGameStats) => void;
  onExit: () => void;
}

const TUTORIAL_KEY = "ns_tutorial_seen";

export const GameCanvas = ({ onGameOver, onExit }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [stats, setStats] = useState<PublicGameStats>({
    score: 0,
    multiplier: 1,
    maxMultiplier: 1,
    alive: 1,
    state: "ready",
    durationSeconds: 0,
    combo: 0,
    comboMultiplier: 1,
  });
  const [muted, setMutedState] = useState(isMuted());
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_KEY) !== "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new GameEngine(canvas, {
      onStatsChange: (s) => setStats(s),
      onGameOver: (s) => onGameOver(s),
    });
    engineRef.current = engine;

    const onResize = () => engine.handleResize();
    window.addEventListener("resize", onResize);

    // Auto-start
    unlockAudio();
    engine.start();
    if (!showTutorial) {
      // nothing else
    } else {
      // Hide tutorial after 4s
      const t = setTimeout(() => {
        setShowTutorial(false);
        try {
          localStorage.setItem(TUTORIAL_KEY, "1");
        } catch {}
      }, 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("resize", onResize);
        engine.stop();
      };
    }

    return () => {
      window.removeEventListener("resize", onResize);
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    unlockAudio();
    engineRef.current?.tap();
  }, []);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  const handleExit = (e: React.MouseEvent) => {
    e.stopPropagation();
    engineRef.current?.stop();
    onExit();
  };

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
      <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <button
            onClick={handleExit}
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md bg-card/60 backdrop-blur border border-border"
          >
            ← Menu
          </button>
        </div>
        <div className="text-center">
          <div className="text-5xl font-bold text-glow-cyan tabular-nums leading-none">
            {stats.score.toLocaleString()}
          </div>
          {stats.comboMultiplier > 1 ? (
            <div className="mt-1 text-xs font-bold uppercase tracking-widest text-glow-magenta animate-pulse">
              Combo ×{stats.comboMultiplier}
            </div>
          ) : (
            <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              Score
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <button
            onClick={toggleMute}
            className="p-2 rounded-md bg-card/60 backdrop-blur border border-border text-muted-foreground hover:text-foreground"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="text-right">
            <div className="text-2xl font-bold text-glow-magenta tabular-nums leading-none">
              ×{stats.multiplier}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
              Bolinhas
            </div>
          </div>
        </div>
      </div>

      {/* Tutorial overlay */}
      {showTutorial && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center px-6 py-4 rounded-2xl bg-background/40 backdrop-blur-sm border border-primary/30 float-up">
            <div className="text-4xl mb-2 pulse-glow">👆</div>
            <div className="text-lg font-bold text-glow-cyan">TOQUE PARA DIVIDIR</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
              Mais bolinhas = mais pontos
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
