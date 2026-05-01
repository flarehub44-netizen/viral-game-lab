import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GameCanvas } from "@/components/GameCanvas";
import type { PublicGameStats, RoundSummaryOut } from "@/game/engine";
import { MULTIPLIER_TIERS, sampleMultiplier, theoreticalRtp } from "@/game/economy/multiplierTable";
import { generateDeterministicLayout } from "@/game/economy/liveDeterministicLayout";
import type { ActiveServerRound } from "@/game/economy/serverRound";
import { invokeAdminAction } from "@/lib/adminAction";

const MULTS = MULTIPLIER_TIERS.map((t) => t.multiplier);

export const AdminSandbox = () => {
  const [stake, setStake] = useState("5");
  const [busy, setBusy] = useState(false);
  const [activeRound, setActiveRound] = useState<ActiveServerRound | null>(null);
  const [simN, setSimN] = useState("5000");
  const [simResult, setSimResult] = useState<string | null>(null);

  const layoutPlan = useMemo(() => {
    if (!activeRound?.layout_seed || activeRound.target_barrier == null) return null;
    return generateDeterministicLayout(activeRound.layout_seed, activeRound.target_barrier);
  }, [activeRound]);

  const startPlay = async () => {
    const s = Math.round(Number(stake.replace(",", ".")) * 100) / 100;
    if (!Number.isFinite(s) || s < 1 || s > 50) {
      toast.error("Stake entre 1 e 50");
      return;
    }
    setBusy(true);
    try {
      const res = await invokeAdminAction<{ ok: boolean; round: ActiveServerRound }>({
        type: "sandbox_round",
        stake: s,
      });
      const r = res.round;
      setActiveRound({
        ...r,
        ok: true,
        visual_result: r.visual_result as ActiveServerRound["visual_result"],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar sandbox");
    } finally {
      setBusy(false);
    }
  };

  const exitPlay = () => {
    setActiveRound(null);
  };

  const runSim = () => {
    const n = Math.min(100_000, Math.max(100, parseInt(simN, 10) || 0));
    const counts = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      const m = sampleMultiplier(() => Math.random());
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    let rtpSim = 0;
    for (const [m, c] of counts) {
      rtpSim += m * (c / n);
    }
    const lines = MULTS.map((m) => {
      const c = counts.get(m) ?? 0;
      const pct = ((c / n) * 100).toFixed(2);
      return `×${m}: ${pct}% (${c})`;
    });
    setSimResult(
      `N=${n}\nRTP simulado: ${(rtpSim * 100).toFixed(2)}% (teórico tabela: ${(theoreticalRtp() * 100).toFixed(2)}%)\n${lines.join("\n")}`,
    );
  };

  const resetSandbox = async () => {
    if (!window.confirm("Apagar todas as rodadas sandbox deste admin no banco?")) return;
    try {
      const res = await invokeAdminAction<{ ok: boolean; deleted: number }>({ type: "reset_sandbox" });
      toast.success(`Removidas: ${res.deleted ?? 0}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  if (activeRound) {
    return (
      <div className="absolute inset-0 z-50 bg-background">
        <GameCanvas
          roundId={activeRound.round_id}
          visualScript={activeRound.visual_result}
          allowScriptTerminate
          qaMode="live"
          mode="live"
          targetBarrier={activeRound.target_barrier}
          layoutPlan={layoutPlan}
          onGameOver={(stats: PublicGameStats, summary: RoundSummaryOut) => {
            toast.message(
              `Fim · score ${stats.score} · mult HUD ${stats.currentMultiplier.toFixed(2)} · barreiras ${summary.barriersPassed ?? 0}`,
            );
          }}
          onExit={exitPlay}
          stakeCredits={activeRound.stake_amount}
          targetMultiplier={activeRound.target_multiplier}
          resultMultiplier={activeRound.result_multiplier}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-6 max-w-4xl xl:max-w-6xl mx-auto pb-24">
      <h1 className="text-xl font-black uppercase tracking-wide">Sandbox</h1>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Gera uma rodada <strong>mode=sandbox</strong> já fechada no banco (sem movimentar carteira). Use para validar
        animação e payout por multiplicador.
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Sorteio automático do sandbox: <strong>80% vitória</strong> (multiplicador {">"} 1.0) e{" "}
        <strong>20% derrota</strong> (multiplicador {"<="} 1.0).
      </p>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase text-muted-foreground">Stake visual (1–50)</span>
        <input
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
        />
      </label>

      <button
        type="button"
        disabled={busy}
        onClick={() => void startPlay()}
        className="w-full py-3 rounded-xl bg-[hsl(140_85%_45%)] text-background font-black uppercase text-sm disabled:opacity-50"
      >
        {busy ? "…" : "Jogar preview"}
      </button>

      <div className="border-t border-border pt-4 space-y-2">
        <h2 className="text-sm font-bold uppercase text-muted-foreground">Simulação RTP (cliente)</h2>
        <div className="flex gap-2">
          <input
            value={simN}
            onChange={(e) => setSimN(e.target.value)}
            className="w-28 rounded border border-border px-2 py-1 text-xs"
          />
          <button type="button" onClick={runSim} className="text-xs font-bold px-3 py-1 rounded border border-border">
            Rodar
          </button>
        </div>
        {simResult && (
          <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-48 overflow-y-auto">
            {simResult}
          </pre>
        )}
      </div>

      <button
        type="button"
        onClick={() => void resetSandbox()}
        className="w-full py-2 text-xs font-bold uppercase text-destructive border border-destructive/40 rounded-lg"
      >
        Limpar rodadas sandbox (DB)
      </button>
    </div>
  );
};
