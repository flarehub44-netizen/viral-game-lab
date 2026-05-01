import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";

type AlertRow = {
  generated_at: string;
  status: string;
  total_rounds: number;
  rejected_rounds: number;
  open_rounds_over_5min: number;
  rtp: number;
  rejected_rate: number;
};

type RtpRow = {
  bucket_hour: string;
  total_stake: number;
  total_payout: number;
  rtp: number;
};

export const AdminOverview = () => {
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [rtpRows, setRtpRows] = useState<RtpRow[]>([]);
  const [roundsToday, setRoundsToday] = useState<number | null>(null);
  const [pixDeps, setPixDeps] = useState<number | null>(null);
  const [pixWd, setPixWd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const iso = start.toISOString();

      const [a, r, gr, pd, pw] = await Promise.all([
        supabase.from("v_monitor_alerts").select("*").maybeSingle(),
        supabase.from("v_rtp_live").select("*").order("bucket_hour", { ascending: false }).limit(24),
        supabase
          .from("game_rounds")
          .select("id", { count: "exact", head: true })
          .gte("created_at", iso)
          .or("mode.is.null,mode.neq.sandbox"),
        supabase.from("pix_deposits").select("id", { count: "exact", head: true }).gte("created_at", iso),
        supabase.from("pix_withdrawals").select("id", { count: "exact", head: true }).gte("created_at", iso),
      ]);

      if (cancelled) return;
      setAlert((a.data as AlertRow) ?? null);
      setRtpRows((r.data as RtpRow[]) ?? []);
      setRoundsToday(gr.count ?? 0);
      setPixDeps(pd.count ?? 0);
      setPixWd(pw.count ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtPct = (x: number) => (x * 100).toFixed(2) + "%";
  const statusColor =
    alert?.status === "ok"
      ? "text-[hsl(140_90%_62%)]"
      : String(alert?.status ?? "").startsWith("warn")
        ? "text-amber-400"
        : "text-destructive";

  return (
    <div className="space-y-6 px-4 py-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-black uppercase tracking-wide">Visão geral</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="text-[10px] uppercase text-muted-foreground">Alertas (última hora)</div>
              <div className={`text-lg font-black mt-1 ${statusColor}`}>{alert?.status ?? "—"}</div>
              <div className="text-[10px] text-muted-foreground mt-2 tabular-nums">
                Rodadas: {alert?.total_rounds ?? 0} · Rejeitadas: {alert?.rejected_rounds ?? 0} · RTP 1h:{" "}
                {alert?.rtp != null ? fmtPct(Number(alert.rtp)) : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="text-[10px] uppercase text-muted-foreground">Hoje (desde meia-noite UTC)</div>
              <div className="text-sm mt-2 space-y-1 tabular-nums">
                <div>Rodadas (exc. sandbox): {roundsToday ?? "—"}</div>
                <div>Depósitos PIX: {pixDeps ?? "—"}</div>
                <div>Saques PIX: {pixWd ?? "—"}</div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-2">
              RTP por hora (últimas 24)
            </h2>
            {rtpRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados agregados.</p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-y-auto text-xs font-mono">
                {rtpRows.map((row) => (
                  <li key={row.bucket_hour} className="flex justify-between border-b border-border/50 py-1">
                    <span className="text-muted-foreground">
                      {new Date(row.bucket_hour).toLocaleString("pt-BR")}
                    </span>
                    <span className="tabular-nums">{fmtPct(Number(row.rtp))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
