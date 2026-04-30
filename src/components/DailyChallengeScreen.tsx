import { ArrowLeft, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getDailyDateKey, getDailyMod, getLocalBest, hasPlayedToday } from "@/game/daily";

interface Props {
  onBack: () => void;
  onPlayDaily: () => void;
  highlightNickname: string;
}

interface Row {
  id: string;
  nickname: string;
  score: number;
  max_multiplier: number;
}

export const DailyChallengeScreen = ({ onBack, onPlayDaily, highlightNickname }: Props) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const mod = getDailyMod();
  const dateKey = getDailyDateKey();
  const localBest = getLocalBest();
  const played = hasPlayedToday();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("daily_scores")
        .select("id, nickname, score, max_multiplier")
        .eq("date_key", dateKey)
        .order("score", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (data) setRows(data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  return (
    <div className="relative w-full h-full flex flex-col px-4 py-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={onBack}
          className="p-2 rounded-md bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-bold text-glow-cyan flex items-center gap-2">
          <Trophy size={18} />
          Diário
        </h2>
        <div className="w-9" />
      </div>

      <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 mb-3">
        <div className="text-[10px] uppercase tracking-widest text-accent">
          Modificador de hoje
        </div>
        <div className="text-sm font-bold text-foreground mt-1">{mod.label}</div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {dateKey} · seed determinística — todos jogam o mesmo
        </div>
      </div>

      {localBest > 0 && (
        <div className="text-center mb-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Seu melhor hoje
          </div>
          <div className="text-2xl font-bold text-glow-yellow tabular-nums">
            {localBest.toLocaleString()}
          </div>
        </div>
      )}

      <button
        onClick={onPlayDaily}
        className="btn-neon w-full py-4 text-base rounded-2xl mb-3"
      >
        {played ? "Tentar de novo" : "Jogar desafio"}
      </button>

      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
        Top do dia
      </div>
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {loading ? (
          <div className="text-center py-8 text-sm text-muted-foreground animate-pulse">
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Seja o primeiro a jogar hoje!
          </div>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((r, i) => {
              const mine = r.nickname === highlightNickname;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                    mine
                      ? "bg-primary/10 border-primary/50"
                      : "bg-card/40 border-border"
                  }`}
                >
                  <div className="w-8 text-center font-bold text-muted-foreground tabular-nums text-sm">
                    {medal ?? `#${i + 1}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{r.nickname}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      ×{r.max_multiplier} max
                    </div>
                  </div>
                  <div className="text-base font-bold text-glow-cyan tabular-nums">
                    {r.score.toLocaleString()}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
};
