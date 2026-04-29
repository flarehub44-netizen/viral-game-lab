import { Trophy, Play, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  bestScore: number;
  nickname: string;
  onPlay: () => void;
  onChangeName: () => void;
  onLeaderboard: () => void;
  challenge?: { score: number } | null;
}

export const StartScreen = ({
  bestScore,
  nickname,
  onPlay,
  onChangeName,
  onLeaderboard,
  challenge,
}: Props) => {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between py-10 px-6 overflow-hidden">
      {/* Background ambient orbs */}
      <div
        className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-3xl opacity-30"
        style={{ background: "hsl(var(--neon-cyan))" }}
      />
      <div
        className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full blur-3xl opacity-20"
        style={{ background: "hsl(var(--neon-magenta))" }}
      />

      <div className="relative text-center mt-8">
        <h1 className="text-6xl sm:text-7xl font-black tracking-tight">
          <span className="text-glow-cyan">NEON</span>
          <br />
          <span className="text-glow-magenta">SPLIT</span>
        </h1>
        <p className="mt-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
          Toque · Divida · Sobreviva
        </p>
      </div>

      {challenge && (
        <div className="relative px-5 py-3 rounded-xl border border-accent/50 bg-accent/10 text-center max-w-xs float-up">
          <div className="text-[10px] uppercase tracking-widest text-accent">
            Desafio recebido
          </div>
          <div className="text-lg font-bold text-glow-yellow mt-1">
            Bata {challenge.score.toLocaleString()} pontos
          </div>
        </div>
      )}

      <div className="relative flex flex-col items-center gap-4 w-full max-w-xs">
        <button
          onClick={onPlay}
          className={`btn-neon w-full py-5 text-xl rounded-2xl ${pulse ? "pulse-glow" : ""}`}
        >
          <Play className="inline mr-2" size={20} />
          Jogar
        </button>

        <div className="grid grid-cols-2 gap-3 w-full">
          <button
            onClick={onLeaderboard}
            className="px-4 py-3 rounded-xl border border-border bg-card/60 text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
          >
            <Trophy size={14} />
            Ranking
          </button>
          <button
            onClick={onChangeName}
            className="px-4 py-3 rounded-xl border border-border bg-card/60 text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors truncate"
          >
            👤 {nickname}
          </button>
        </div>

        {bestScore > 0 && (
          <div className="text-center mt-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Seu recorde
            </div>
            <div className="text-2xl font-bold text-glow-yellow tabular-nums">
              {bestScore.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <div className="relative text-[10px] text-muted-foreground/60 uppercase tracking-widest">
        v1.0
      </div>
    </div>
  );
};
