import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type HealthRow = {
  bucket_hour: string;
  total_rounds: number;
  closed_rounds: number;
  expired_rounds: number;
  rejected_rounds: number;
};

type RtpRow = {
  bucket_hour: string;
  total_stake: number;
  total_payout: number;
  rtp: number;
};

type AlertRow = {
  generated_at: string;
  status: string;
  total_rounds: number;
  rejected_rounds: number;
  open_rounds_over_5min: number;
  rtp: number;
  rejected_rate: number;
};

export const ClimbMonitoringPanel = () => {
  const [health, setHealth] = useState<HealthRow[]>([]);
  const [rtp, setRtp] = useState<RtpRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow | null>(null);

  useEffect(() => {
    void (async () => {
      const [{ data: h }, { data: r }, { data: a }] = await Promise.all([
        supabase.from("v_round_health").select("*").order("bucket_hour", { ascending: false }).limit(24),
        supabase.from("v_rtp_live").select("*").order("bucket_hour", { ascending: false }).limit(24),
        supabase.from("v_monitor_alerts").select("*").limit(1).maybeSingle(),
      ]);
      setHealth((h as HealthRow[]) ?? []);
      setRtp((r as RtpRow[]) ?? []);
      setAlerts((a as AlertRow) ?? null);
    })();
  }, []);

  return (
    <div className="space-y-3 text-xs">
      <h3 className="font-bold uppercase tracking-widest">CLIMB Monitoring</h3>
      <div className="rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">Alertas (janela 1h)</div>
        {alerts ? (
          <div className="space-y-1 tabular-nums">
            <div className="flex justify-between">
              <span>Status</span>
              <span>{alerts.status}</span>
            </div>
            <div className="flex justify-between">
              <span>RTP</span>
              <span>{(Number(alerts.rtp) * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Rejected rate</span>
              <span>{(Number(alerts.rejected_rate) * 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Open rounds &gt; 5min</span>
              <span>{alerts.open_rounds_over_5min}</span>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">Sem dados.</div>
        )}
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">RTP por hora</div>
        {rtp.slice(0, 6).map((row) => (
          <div key={row.bucket_hour} className="flex justify-between tabular-nums">
            <span>{new Date(row.bucket_hour).toLocaleString("pt-BR")}</span>
            <span>{(Number(row.rtp) * 100).toFixed(2)}%</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border p-3">
        <div className="font-semibold mb-2">Saúde de rounds</div>
        {health.slice(0, 6).map((row) => (
          <div key={row.bucket_hour} className="flex justify-between tabular-nums">
            <span>{new Date(row.bucket_hour).toLocaleString("pt-BR")}</span>
            <span>
              c:{row.closed_rounds} e:{row.expired_rounds} r:{row.rejected_rounds}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
