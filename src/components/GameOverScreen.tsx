import { Trophy, RotateCcw, Home, Sparkles, Award, Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicGameStats } from "@/game/engine";
import type { RoundResult } from "@/game/progression";
import { levelFromXp } from "@/game/progression";

interface Props {
  stats: PublicGameStats;
  isNewBest: boolean;
  bestScore: number;
  onRetry: () => void;
  onMenu: () => void;
  onLeaderboard: () => void;
  saving?: boolean;
  progression: RoundResult | null;
  maxCombo: number;
}

export const GameOverScreen = ({
  stats,
  isNewBest,
  bestScore,
  onRetry,
  onMenu,
  onLeaderboard,
  saving,
  progression,
  maxCombo,
}: Props) => {
  // Animate XP bar from before -> after
  const [animXp, setAnimXp] = useState(progression?.xpBefore ?? 0);
  useEffect(() => {
    if (!progression) return;
    setAnimXp(progression.xpBefore);
    const start = performance.now();
    const dur = 900;
    const from = progression.xpBefore;
    const to = progression.xpAfter;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setAnimXp(Math.round(from + (to - from) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progression]);

  const lvl = levelFromXp(animXp);
  const leveledUp = progression && progression.levelAfter > progression.levelBefore;

  return (
    <div className="absolute inset-0 flex flex-col p-6 bg-gradient-to-b from-background via-background to-card overflow-y-auto animate-fade-in">
      <div className="w-full text-center pt-2">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">
          Fim de jogo
        </div>
        {isNewBest && (
          <div className="inline-block px-3 py-1 mb-2 rounded-full bg-primary/20 border border-primary text-primary text-[10px] uppercase tracking-widest font-bold pulse-glow">
            ★ Novo recorde!
          </div>
        )}
        {leveledUp && (
          <div className="inline-block ml-2 px-3 py-1 mb-2 rounded-full bg-secondary/20 border border-secondary text-secondary text-[10px] uppercase tracking-widest font-bold pulse-glow">
            ↑ Nível {progression!.levelAfter}!
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center mt-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Pontos
        </div>
        <div className="text-6xl font-black text-glow-cyan tabular-nums leading-none">
          {stats.score.toLocaleString()}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Recorde
            </div>
            <div className="text-lg font-bold tabular-nums">
              {Math.max(bestScore, stats.score).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Combo
            </div>
            <div className="text-lg font-bold tabular-nums text-glow-magenta">
              ×{maxCombo}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Tempo
            </div>
            <div className="text-lg font-bold tabular-nums">{stats.durationSeconds}s</div>
          </div>
        </div>
      </div>

      {/* XP / Level bar */}
      {progression && (
        <div className="mt-5 mx-auto w-full max-w-xs rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[10px] font-black text-background">
                {lvl.level}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Nível
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-glow-yellow tabular-nums">
              <Sparkles size={12} />+{progression.xpGained} XP
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all"
              style={{ width: `${lvl.progress * 100}%` }}
            />
          </div>
          <div className="text-[10px] tabular-nums text-muted-foreground mt-1 text-right">
            {lvl.intoLevel} / {lvl.needed} XP
          </div>
        </div>
      )}

      {/* Missions / Achievements completed */}
      {progression && (progression.missionsCompleted.length > 0 || progression.achievementsUnlocked.length > 0) && (
        <div className="mt-3 mx-auto w-full max-w-xs flex flex-col gap-2">
          {progression.missionsCompleted.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-xs"
            >
              <Check size={14} className="text-primary" />
              <span className="flex-1">{m.label}</span>
              <span className="font-bold text-glow-yellow">+{m.xp}</span>
            </div>
          ))}
          {progression.achievementsUnlocked.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-secondary bg-secondary/10 px-3 py-2 text-xs"
            >
              <Award size={14} className="text-secondary" />
              <span className="flex-1">{a.label}</span>
              <span className="font-bold text-glow-yellow">+25</span>
            </div>
          ))}
        </div>
      )}

      {saving && (
        <div className="mt-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Salvando ranking...
        </div>
      )}

      <div className="flex-1 min-h-4" />

      <div className="w-full max-w-xs mx-auto flex flex-col gap-3 mt-4">
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
