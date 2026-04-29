import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy } from "lucide-react";

type Range = "today" | "week" | "all";

interface ScoreRow {
  id: string;
  nickname: string;
  score: number;
  max_multiplier: number;
  created_at: string;
}

interface Props {
  onBack: () => void;
  highlightNickname: string;
}

export const Leaderboard = ({ onBack, highlightNickname }: Props) => {
  const [range, setRange] = useState<Range>("all");
  const [rows, setRows] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      let q = supabase
        .from("scores")
        .select("id, nickname, score, max_multiplier, created_at")
        .order("score", { ascending: false })
        .limit(100);

      if (range === "today") {
        const since = new Date();
        since.setHours(0, 0, 0, 0);
        q = q.gte("created_at", since.toISOString());
      } else if (range === "week") {
        const since = new Date();
        since.setDate(since.getDate() - 7);
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q;
      if (cancelled) return;
      if (!error && data) setRows(data);
      setLoading(false);
    };
    fetch();
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="relative w-full h-full flex flex-col px-4 py-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="p-2 rounded-md bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-bold text-glow-yellow flex items-center gap-2">
          <Trophy size={20} />
          Ranking
        </h2>
        <div className="w-9" />
      </div>

      <div className="flex gap-1 p-1 rounded-lg bg-card/60 border border-border mb-4">
        {(["today", "week", "all"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 py-2 text-xs uppercase tracking-widest rounded-md transition-colors ${
              range === r
                ? "bg-primary/20 text-primary border border-primary/50"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r === "today" ? "Hoje" : r === "week" ? "Semana" : "Sempre"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-sm animate-pulse">
            Carregando...
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum score ainda. Seja o primeiro!
          </div>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((row, i) => {
              const mine = row.nickname === highlightNickname;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <li
                  key={row.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                    mine
                      ? "bg-primary/10 border-primary/50"
                      : "bg-card/40 border-border"
                  }`}
                >
                  <div className="w-8 text-center font-bold text-muted-foreground tabular-nums">
                    {medal ?? `#${i + 1}`}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{row.nickname}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      ×{row.max_multiplier} max
                    </div>
                  </div>
                  <div className="text-lg font-bold text-glow-cyan tabular-nums">
                    {row.score.toLocaleString()}
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
