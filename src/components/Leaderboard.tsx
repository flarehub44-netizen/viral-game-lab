import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy } from "lucide-react";

interface ScoreRow {
  id: string;
  nickname: string;
  score: number;
  created_at: string;
}

interface Props {
  onBack: () => void;
  highlightNickname: string;
}

// Simple in-memory cache shared across mounts to avoid re-fetching
// when the user bounces between Menu / Game Over / Leaderboard.
const CACHE_TTL_MS = 30_000;
let cache: { rows: ScoreRow[]; ts: number } | null = null;

export function invalidateLeaderboardCache() {
  cache = null;
}

export const Leaderboard = ({ onBack, highlightNickname }: Props) => {
  const [rows, setRows] = useState<ScoreRow[]>(cache?.rows ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_TTL_MS) {
      setRows(cache.rows);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("scores")
        .select("id, nickname, score, created_at")
        .order("score", { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (!error && data) {
        cache = { rows: data, ts: Date.now() };
        setRows(data);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
