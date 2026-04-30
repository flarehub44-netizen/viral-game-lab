import { Trophy, Play, Target, Award, Coins } from "lucide-react";
import { levelFromXp, loadProgression, getRunGoals } from "@/game/progression";

interface Props {
  bestScore: number;
  nickname: string;
  onPlay: () => void;
  onChangeName: () => void;
  onLeaderboard: () => void;
  onMissions: () => void;
  onAchievements: () => void;
}

export const StartScreen = ({
  bestScore,
  nickname,
  onPlay,
  onChangeName,
  onLeaderboard,
  onMissions,
  onAchievements,
}: Props) => {
  const prog = loadProgression();
  const lvl = levelFromXp(prog.xp);
  const missionsLeft = prog.missions.list.filter((m) => !m.done).length;
  const runGoalsCount = getRunGoals().length;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-between p-6 bg-gradient-to-b from-background via-background to-card">
      {/* Top: Level + XP */}
      <div className="w-full max-w-xs flex flex-col gap-2">
        <div className="rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[11px] font-black text-background">
                {lvl.level}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Nível
              </div>
            </div>
            <div className="text-[10px] tabular-nums text-muted-foreground">
              {lvl.intoLevel} / {lvl.needed} XP
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all"
              style={{ width: `${lvl.progress * 100}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card/40 p-3 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Créditos
          </div>
          <div className="flex items-center gap-1 text-sm font-bold text-glow-yellow tabular-nums">
            <Coins size={14} />
            {prog.credits}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <h1 className="text-6xl font-black tracking-tight text-glow-cyan mb-2">
          NEON
        </h1>
        <h1 className="text-6xl font-black tracking-tight text-glow-magenta mb-6">
          SPLIT
        </h1>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
          Toque para dividir
        </p>
        <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground mt-1">
          Desvie das barreiras
        </p>
        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-3">
          Metas da rodada: {runGoalsCount}
        </p>

        {bestScore > 0 && (
          <div className="mt-6 px-4 py-2 rounded-lg bg-card/40 backdrop-blur border border-border">
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

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onMissions}
            className="relative py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <Target size={14} />
            Missões
            {missionsLeft > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-black flex items-center justify-center">
                {missionsLeft}
              </span>
            )}
          </button>
          <button
            onClick={onAchievements}
            className="py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <Award size={14} />
            Conquistas
          </button>
        </div>

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
