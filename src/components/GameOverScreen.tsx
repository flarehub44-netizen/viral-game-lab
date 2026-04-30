import { useEffect, useState } from "react";
import type { PublicGameStats } from "@/game/engine";
import { RotateCcw, Share2, Trophy, Home, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { shareCard } from "@/lib/shareCard";
import type { Mission } from "@/game/missions";

interface Props {
  stats: PublicGameStats;
  isNewBest: boolean;
  nickname: string;
  onRetry: () => void;
  onMenu: () => void;
  onLeaderboard: () => void;
  saving: boolean;
  newlyCompletedMissions: Mission[];
}

export const GameOverScreen = ({
  stats,
  isNewBest,
  nickname,
  onRetry,
  onMenu,
  onLeaderboard,
  saving,
  newlyCompletedMissions,
}: Props) => {
  const [animatedScore, setAnimatedScore] = useState(0);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

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

  // Calcula percentil — % de runs de hoje com score menor que o seu
  useEffect(() => {
    let cancelled = false;
    if (stats.score < 1) return;
    (async () => {
      try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const { count: lower } = await supabase
          .from("scores")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString())
          .lt("score", stats.score);
        const { count: total } = await supabase
          .from("scores")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfDay.toISOString());
        if (cancelled) return;
        if (total && total > 5 && lower != null) {
          setPercentile(Math.round((lower / total) * 100));
        }
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stats.score]);

  const handleShare = async () => {
    setSharing(true);
    try {
      const url = `${window.location.origin}/?challenge=${stats.score}`;
      const result = await shareCard({
        score: stats.score,
        maxMultiplier: stats.maxMultiplier,
        durationSeconds: stats.durationSeconds,
        nickname,
        challengeUrl: url,
      });
      if (result === "downloaded") toast.success("Imagem baixada!");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível compartilhar");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between py-8 px-6 overflow-y-auto">
      <div
        className="absolute top-0 left-0 right-0 h-40 blur-3xl opacity-30"
        style={{ background: "hsl(var(--destructive))" }}
      />

      <div className="relative text-center mt-4 shrink-0">
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Game Over
        </div>
        {isNewBest && (
          <div className="mt-2 inline-block px-3 py-1 rounded-full bg-accent/20 border border-accent text-accent text-xs uppercase tracking-widest float-up">
            ✨ Novo recorde!
          </div>
        )}
      </div>

      <div className="relative text-center shrink-0">
        <div className="text-7xl font-black text-glow-cyan tabular-nums leading-none">
          {animatedScore.toLocaleString()}
        </div>
        <div className="mt-2 text-xs uppercase tracking-widest text-muted-foreground">
          Pontos
        </div>

        {percentile != null && percentile >= 50 && (
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-glow-cyan text-xs uppercase tracking-widest">
            Melhor que {percentile}% hoje
          </div>
        )}

        <div className="mt-6 flex gap-6 justify-center">
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

      {/* Missões recém-completadas */}
      {newlyCompletedMissions.length > 0 && (
        <div className="relative w-full max-w-xs rounded-xl border border-primary/40 bg-primary/10 p-3 shrink-0 float-up">
          <div className="text-[10px] uppercase tracking-widest text-glow-cyan mb-2">
            Missão completada!
          </div>
          <ul className="space-y-1">
            {newlyCompletedMissions.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 size={14} className="text-primary shrink-0" />
                <span>{m.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="relative w-full max-w-xs flex flex-col gap-3 shrink-0">
        <button onClick={onRetry} className="btn-neon w-full py-4 text-lg rounded-2xl">
          <RotateCcw className="inline mr-2" size={18} />
          Jogar de novo
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="px-3 py-3 rounded-xl border border-secondary/50 bg-secondary/10 text-secondary text-xs uppercase tracking-wider hover:bg-secondary/20 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Share2 size={14} />
            {sharing ? "..." : "Share"}
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
