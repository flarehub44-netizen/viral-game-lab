import { useEffect, useState } from "react";
import type { PublicGameStats } from "@/game/engine";
import { RotateCcw, Share2, Trophy, Home } from "lucide-react";
import { toast } from "sonner";

interface Props {
  stats: PublicGameStats;
  isNewBest: boolean;
  nickname: string;
  onRetry: () => void;
  onMenu: () => void;
  onLeaderboard: () => void;
  saving: boolean;
}

export const GameOverScreen = ({
  stats,
  isNewBest,
  nickname,
  onRetry,
  onMenu,
  onLeaderboard,
  saving,
}: Props) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const target = stats.score;
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.floor(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stats.score]);

  const handleShare = async () => {
    const url = `${window.location.origin}/?challenge=${stats.score}`;
    const text = `Fiz ${stats.score.toLocaleString()} pontos no Neon Split (×${stats.maxMultiplier} max)! Consegue mais? ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Neon Split", text, url });
        return;
      } catch {
        // user cancelled
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between py-10 px-6 overflow-hidden">
      <div
        className="absolute top-0 left-0 right-0 h-40 blur-3xl opacity-30"
        style={{ background: "hsl(var(--destructive))" }}
      />

      <div className="relative text-center mt-6">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Game Over
        </div>
        {isNewBest && (
          <div className="mt-2 inline-block px-3 py-1 rounded-full bg-accent/20 border border-accent text-accent text-xs uppercase tracking-widest float-up">
            ✨ Novo recorde!
          </div>
        )}
      </div>

      <div className="relative text-center">
        <div className="text-7xl font-black text-glow-cyan tabular-nums leading-none">
          {animatedScore.toLocaleString()}
        </div>
        <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
          Pontos
        </div>

        <div className="mt-8 flex gap-6 justify-center">
          <div className="text-center">
            <div className="text-3xl font-bold text-glow-magenta tabular-nums">
              ×{stats.maxMultiplier}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Multi máx
            </div>
          </div>
          <div className="w-px bg-border" />
          <div className="text-center">
            <div className="text-3xl font-bold text-glow-yellow tabular-nums">
              {stats.durationSeconds}s
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
              Tempo
            </div>
          </div>
        </div>

        {saving && (
          <div className="mt-4 text-xs text-muted-foreground animate-pulse">
            Salvando no ranking...
          </div>
        )}
      </div>

      <div className="relative w-full max-w-xs flex flex-col gap-3">
        <button onClick={onRetry} className="btn-neon w-full py-4 text-lg rounded-2xl">
          <RotateCcw className="inline mr-2" size={18} />
          Jogar de novo
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleShare}
            className="px-3 py-3 rounded-xl border border-secondary/50 bg-secondary/10 text-secondary text-xs uppercase tracking-wider hover:bg-secondary/20 transition-colors flex items-center justify-center gap-1"
          >
            <Share2 size={14} />
            Share
          </button>
          <button
            onClick={onLeaderboard}
            className="px-3 py-3 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
          >
            <Trophy size={14} />
            Ranking
          </button>
          <button
            onClick={onMenu}
            className="px-3 py-3 rounded-xl border border-border bg-card/60 text-muted-foreground hover:text-foreground text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-1"
          >
            <Home size={14} />
            Menu
          </button>
        </div>
      </div>
    </div>
  );
};
