import { Trophy, Play } from "lucide-react";

interface Props {
  bestScore: number;
  nickname: string;
  onPlay: () => void;
  onChangeName: () => void;
  onLeaderboard: () => void;
}

export const StartScreen = ({
  bestScore,
  nickname,
  onPlay,
  onChangeName,
  onLeaderboard,
}: Props) => {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between p-8 bg-gradient-to-b from-background via-background to-card">
      <div />

      <div className="flex flex-col items-center text-center">
        <h1 className="text-6xl font-black tracking-tight text-glow-cyan mb-2">
          NEON
        </h1>
        <h1 className="text-6xl font-black tracking-tight text-glow-magenta mb-8">
          SPLIT
        </h1>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
          Toque para dividir
        </p>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground mt-1">
          Desvie das barreiras
        </p>

        {bestScore > 0 && (
          <div className="mt-8 px-4 py-2 rounded-lg bg-card/40 backdrop-blur border border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Recorde
            </div>
            <div className="text-2xl font-bold text-glow-cyan tabular-nums">
              {bestScore.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={onPlay}
          className="btn-neon w-full py-4 text-xl font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2"
        >
          <Play size={20} fill="currentColor" />
          Jogar
        </button>

        <button
          onClick={onLeaderboard}
          className="w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
        >
          <Trophy size={16} />
          Ranking
        </button>

        <button
          onClick={onChangeName}
          className="w-full py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Apelido: <span className="text-foreground font-bold">{nickname}</span>
        </button>
      </div>
    </div>
  );
};
