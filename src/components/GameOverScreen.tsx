import { Trophy, RotateCcw, Home } from "lucide-react";
import type { PublicGameStats } from "@/game/engine";

interface Props {
  stats: PublicGameStats;
  isNewBest: boolean;
  bestScore: number;
  onRetry: () => void;
  onMenu: () => void;
  onLeaderboard: () => void;
  saving?: boolean;
}

export const GameOverScreen = ({
  stats,
  isNewBest,
  bestScore,
  onRetry,
  onMenu,
  onLeaderboard,
  saving,
}: Props) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between p-8 bg-gradient-to-b from-background via-background to-card">
      <div className="w-full text-center pt-6">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Fim de jogo
        </div>
        {isNewBest && (
          <div className="inline-block px-3 py-1 mb-3 rounded-full bg-primary/20 border border-primary text-primary text-[10px] uppercase tracking-widest font-bold pulse-glow">
            ★ Novo recorde!
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Pontos
        </div>
        <div className="text-7xl font-black text-glow-cyan tabular-nums leading-none">
          {stats.score.toLocaleString()}
        </div>
        <div className="mt-6 flex gap-6 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Recorde
            </div>
            <div className="text-xl font-bold tabular-nums">
              {Math.max(bestScore, stats.score).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Tempo
            </div>
            <div className="text-xl font-bold tabular-nums">
              {stats.durationSeconds}s
            </div>
          </div>
        </div>
        {saving && (
          <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">
            Salvando ranking...
          </div>
        )}
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={onRetry}
          className="btn-neon w-full py-4 text-lg font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2"
        >
          <RotateCcw size={18} />
          Jogar de novo
        </button>
        <div className="flex gap-3">
          <button
            onClick={onLeaderboard}
            className="flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <Trophy size={14} />
            Ranking
          </button>
          <button
            onClick={onMenu}
            className="flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <Home size={14} />
            Menu
          </button>
        </div>
      </div>
    </div>
  );
};
