import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";

type FraudRow = {
  id: number;
  user_id: string | null;
  round_id: string | null;
  signal: string;
  score: number;
  payload: Record<string, unknown>;
  created_at: string;
};

export const AdminFraud = () => {
  const [rows, setRows] = useState<FraudRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let c = false;
    (async () => {
      const { data, error } = await supabase
        .from("fraud_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!c) {
        if (error) setRows([]);
        else setRows((data as FraudRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  if (loading) return <p className="px-4 py-6 text-sm text-muted-foreground">Carregando…</p>;

  const bySignal = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.signal] = (acc[r.signal] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4 px-4 py-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black uppercase tracking-wide">Sinais de fraude</h1>
      <div className="flex flex-wrap gap-2 text-[10px]">
        {Object.entries(bySignal).map(([sig, n]) => (
          <span key={sig} className="rounded-full border border-border px-2 py-1 bg-card/50">
            {sig}: <strong>{n}</strong>
          </span>
        ))}
      </div>
      <ul className="space-y-2 max-h-[60vh] overflow-y-auto text-xs">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-border bg-card/30 p-2 font-mono">
            <div className="flex justify-between text-muted-foreground">
              <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              <span>score {r.score}</span>
            </div>
            <div className="text-foreground font-bold mt-1">{r.signal}</div>
            <div className="text-[10px] mt-1 break-all">
              user: {r.user_id ?? "—"} · round: {r.round_id ?? "—"}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
