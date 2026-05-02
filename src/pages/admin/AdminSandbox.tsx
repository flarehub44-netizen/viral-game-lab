import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  TriangleAlert,
  Users,
  Zap,
} from "lucide-react";
import { GameCanvas } from "@/components/GameCanvas";
import { GameOverScreen } from "@/components/GameOverScreen";
import type { PublicGameStats, RoundSummaryOut } from "@/game/engine";
import { MULTIPLIER_TIERS, sampleMultiplier, theoreticalRtp } from "@/game/economy/multiplierTable";
import { generateDeterministicLayout } from "@/game/economy/liveDeterministicLayout";
import type { ActiveServerRound, ServerEconomyPayload } from "@/game/economy/serverRound";
import { invokeAdminAction } from "@/lib/adminAction";
import { BET_AMOUNTS } from "@/game/economy/constants";
import { MULTIPLIER_CURVE_HARD_CAP } from "@/game/economy/multiplierCurve";
import { applyRound, type RoundResult } from "@/game/progression";

const MULTS = MULTIPLIER_TIERS.map((t) => t.multiplier);

// Saldo "fake" só para a UI ficar idêntica ao real — nunca toca a wallet.
const FAKE_BALANCE = 1000;

function pseudoOnlinePlayers(): number {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return 300 + (seed % 120);
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface OverState {
  stats: PublicGameStats;
  summary: RoundSummaryOut;
  economy: ServerEconomyPayload;
  progression: RoundResult | null;
  bestScore: number;
  isNewBest: boolean;
}

export const AdminSandbox = () => {
  const [bet, setBet] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [activeRound, setActiveRound] = useState<ActiveServerRound | null>(null);
  const [over, setOver] = useState<OverState | null>(null);

  // Admin tools
  const [toolsOpen, setToolsOpen] = useState(false);
  const [forceMult, setForceMult] = useState<string>(""); // "" = aleatório
  const [forceBarrier, setForceBarrier] = useState<string>("");
  const [simN, setSimN] = useState("5000");
  const [simResult, setSimResult] = useState<string | null>(null);

  const online = useMemo(() => pseudoOnlinePlayers(), []);

  const layoutPlan = useMemo(() => {
    if (!activeRound?.layout_seed || activeRound.target_barrier == null) return null;
    return generateDeterministicLayout(activeRound.layout_seed, activeRound.target_barrier);
  }, [activeRound]);

  // Sandbox: visual sem teto de R$ 400 — mostra entrada × multiplicador máximo da curva.
  const maxPayout = bet > 0 ? bet * MULTIPLIER_CURVE_HARD_CAP : 0;
  const canPlay = bet > 0 && !busy;

  const startPlay = async (overrideMult?: number, overrideBarrier?: number) => {
    if (!bet || bet < 1 || bet > 50) {
      toast.error("Selecione um valor de entrada");
      return;
    }
    setBusy(true);
    setOver(null);
    try {
      const payload: Parameters<typeof invokeAdminAction>[0] = {
        type: "sandbox_round",
        stake: bet,
      };
      const fm = overrideMult ?? (forceMult ? Number(forceMult) : undefined);
      const fb = overrideBarrier ?? (forceBarrier ? Number(forceBarrier) : undefined);
      if (typeof fm === "number" && Number.isFinite(fm)) payload.force_multiplier = fm;
      if (typeof fb === "number" && Number.isFinite(fb) && fb > 0) payload.force_target_barrier = fb;

      const res = await invokeAdminAction<{ ok: boolean; round: ActiveServerRound }>(payload);
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
    for (const [m, c] of counts) rtpSim += m * (c / n);
    const lines = MULTS.map((m) => {
      const c = counts.get(m) ?? 0;
      const pct = ((c / n) * 100).toFixed(2);
      return `×${m}: ${pct}% (${c})`;
    });
    setSimResult(
      `N=${n}\nRTP simulado: ${(rtpSim * 100).toFixed(2)}% (teórico: ${(theoreticalRtp() * 100).toFixed(2)}%)\n${lines.join("\n")}`,
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

  // ============== Tela de fim de jogo (igual live) ==============
  if (over && !activeRound) {
    return (
      <div className="absolute inset-0 z-50 bg-background overflow-y-auto">
        <GameOverScreen
          stats={over.stats}
          isNewBest={over.isNewBest}
          bestScore={over.bestScore}
          onRetry={() => {
            setOver(null);
            void startPlay();
          }}
          onMenu={() => setOver(null)}
          onLeaderboard={() => setOver(null)}
          progression={over.progression}
          maxCombo={over.summary.maxCombo}
          serverEconomy={over.economy}
          economySource="server"
          onChangeStake={() => setOver(null)}
          barriersPassed={over.summary.barriersPassed}
        />
      </div>
    );
  }

  // ============== Tela de jogo ativo ==============
  if (activeRound) {
    return (
      <div className="absolute inset-0 z-50 bg-background">
        {/* HUD overlay sandbox */}
        <div className="pointer-events-none absolute top-2 left-2 z-[60] flex flex-col gap-1.5 max-w-[60%]">
          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[hsl(280_50%_15%/0.9)] border border-[hsl(280_70%_50%)] backdrop-blur-sm">
            <FlaskConical size={11} className="text-[hsl(280_90%_75%)]" />
            <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(280_90%_75%)]">
              Sandbox
            </span>
          </div>
          <div className="pointer-events-auto rounded-lg bg-background/85 border border-border backdrop-blur-sm px-2 py-1.5 text-[10px] font-mono leading-tight space-y-0.5">
            <div>
              <span className="text-muted-foreground">mult: </span>
              <span className="font-black text-[hsl(140_90%_60%)]">
                ×{activeRound.result_multiplier}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">target: </span>
              <span className="text-foreground">{activeRound.target_barrier}b</span>
              <span className="text-muted-foreground"> · {activeRound.max_duration_seconds}s</span>
            </div>
            <div>
              <span className="text-muted-foreground">payout: </span>
              <span className="text-foreground tabular-nums">
                R$ {fmt(activeRound.payout_amount)}
              </span>
            </div>
          </div>
        </div>

        <GameCanvas
          roundId={activeRound.round_id}
          visualScript={activeRound.visual_result}
          allowScriptTerminate
          qaMode="live"
          mode="live"
          targetBarrier={activeRound.target_barrier}
          layoutPlan={layoutPlan}
          onGameOver={(stats: PublicGameStats, summary: RoundSummaryOut) => {
            const round = activeRound;
            const economy: ServerEconomyPayload = {
              stake: round.stake_amount,
              resultMultiplier: round.result_multiplier,
              payout: round.payout_amount,
              netResult: round.net_result,
              reachedTarget: round.payout_amount > 0,
              barriersPassed: summary.barriersPassed ?? 0,
              targetBarrier: round.target_barrier ?? 0,
              mode: "live",
            };
            const progression = applyRound(
              {
                score: summary.score,
                durationSeconds: summary.durationSeconds,
                maxCombo: summary.maxCombo,
                maxAlive: summary.maxAlive,
                splits: summary.splits,
                powerupsCollected: summary.powerupsCollected,
                barriersPassed: summary.barriersPassed,
                finalMultiplier: round.result_multiplier,
              },
              "default",
            );
            setOver({
              stats,
              summary,
              economy,
              progression,
              bestScore: stats.score,
              isNewBest: false,
            });
            setActiveRound(null);
          }}
          onExit={exitPlay}
          stakeCredits={activeRound.stake_amount}
          targetMultiplier={activeRound.target_multiplier}
          resultMultiplier={activeRound.result_multiplier}
        />
      </div>
    );
  }

  // ============== Setup pré-jogo ==============
  return (
    <div className="relative flex flex-col min-h-[calc(100vh-44px)] bg-gradient-to-b from-[hsl(280_45%_10%)] via-background to-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 shrink-0 border-b border-border">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="text-[11px] font-black uppercase tracking-widest text-foreground flex items-center gap-1.5">
          INICIAR PARTIDA
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card/50 border border-border text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(140_90%_55%)] animate-pulse" />
          <Users size={11} />
          {online}
        </div>
      </div>

      {"\n"}

      {/* Conteúdo */}
      <div className="flex-1 px-5 py-5 space-y-6 pb-36">
        <div className="text-center">
          <h2 className="text-xl font-black uppercase tracking-wide mb-1">Iniciar partida</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Aposte e jogue até perder todas as bolas. Quanto mais barreiras passar, maior o pagamento.
          </p>
        </div>

        {/* Seletor de stake */}
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Valor de entrada (R$)
          </div>
          <div className="flex flex-wrap gap-2 justify-center">
            {BET_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setBet(amount)}
                className={`min-w-[52px] px-3 py-2 rounded-full border text-sm font-black tabular-nums transition-colors ${
                  bet === amount
                    ? "border-primary bg-primary/20 text-primary shadow-[0_0_16px_hsl(var(--primary)/0.35)]"
                    : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {amount}
              </button>
            ))}
          </div>
        </div>

        {/* Card entrada */}
        <div className="rounded-2xl border border-border bg-card/35 p-6 text-center space-y-1">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Entrada selecionada
          </div>
          <div className="text-4xl font-black tabular-nums text-white">R$ {fmt(bet)}</div>
        </div>

        {/* Multiplicador / pagamento */}
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl border border-border bg-card/30 px-2 py-3">
            <div className="text-[9px] uppercase text-muted-foreground leading-tight mb-1">
              Multiplicador máximo
            </div>
            <div className="text-sm font-black tabular-nums text-secondary flex items-center justify-center gap-1">
              <TrendingUp size={12} />
              {MULTIPLIER_CURVE_HARD_CAP}×
            </div>
          </div>
          <div className="rounded-xl border border-secondary/50 bg-secondary/10 px-2 py-3 shadow-[0_0_18px_hsl(var(--secondary)/0.15)]">
            <div className="text-[9px] uppercase text-muted-foreground leading-tight mb-1">
              Pagamento máximo
            </div>
            <div className="text-sm font-black tabular-nums text-secondary">R$ {fmt(maxPayout)}</div>
          </div>
        </div>

        {/* Saldo fake */}
        <p className="text-[11px] text-center text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 border border-border">
          Saldo atual:{" "}
          <span className="text-foreground font-bold tabular-nums">R$ {fmt(FAKE_BALANCE)}</span>.{" "}
          Pagamento: entrada × multiplicador
        </p>

        <p className="text-[10px] text-center text-muted-foreground px-1 leading-relaxed">
          Jogue com responsabilidade. Proibido para menores de 18 anos.
        </p>


        {/* Ferramentas de admin */}
        <div className="rounded-xl border border-border bg-card/20 overflow-hidden">
          <button
            type="button"
            onClick={() => setToolsOpen((o) => !o)}
            className="w-full px-3 py-2.5 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-muted-foreground/30"
          >
            <span className="flex items-center gap-2">
              {"\n"}
            </span>
            {toolsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {toolsOpen && (
            <div className="px-3 pb-3 pt-1 space-y-4 border-t border-border">
              {/* Presets rápidos */}
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-2 flex items-center gap-1">
                  <Zap size={11} /> Presets de resultado
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => void startPlay(20)}
                    className="px-2 py-2 rounded-lg border border-[hsl(140_70%_45%/0.5)] bg-[hsl(140_30%_10%/0.5)] text-[10px] font-black uppercase text-[hsl(140_90%_70%)] disabled:opacity-40"
                  >
                    Win+ ×20
                  </button>
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => void startPlay(2)}
                    className="px-2 py-2 rounded-lg border border-secondary/50 bg-secondary/10 text-[10px] font-black uppercase text-secondary disabled:opacity-40"
                  >
                    Win ×2
                  </button>
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => void startPlay(0)}
                    className="px-2 py-2 rounded-lg border border-destructive/40 bg-destructive/10 text-[10px] font-black uppercase text-destructive disabled:opacity-40"
                  >
                    Loss ×0
                  </button>
                </div>
              </div>

              {/* Override mult/barrier */}
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <Target size={10} /> Forçar mult.
                  </span>
                  <select
                    value={forceMult}
                    onChange={(e) => setForceMult(e.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    <option value="">Aleatório (80/20)</option>
                    {MULTS.map((m) => (
                      <option key={m} value={m}>
                        ×{m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase text-muted-foreground">
                    Forçar barreira (1-200)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={forceBarrier}
                    onChange={(e) => setForceBarrier(e.target.value)}
                    placeholder="auto"
                    className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs tabular-nums"
                  />
                </label>
              </div>

              {/* RTP sim */}
              <div className="border-t border-border pt-3 space-y-2">
                <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                  <Sparkles size={11} /> Simulação RTP (cliente)
                </div>
                <div className="flex gap-2">
                  <input
                    value={simN}
                    onChange={(e) => setSimN(e.target.value)}
                    className="w-24 rounded border border-border bg-background px-2 py-1 text-xs tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={runSim}
                    className="text-[10px] font-bold uppercase px-3 py-1 rounded border border-border hover:bg-muted/30"
                  >
                    Rodar
                  </button>
                </div>
                {simResult && (
                  <pre className="text-[10px] font-mono whitespace-pre-wrap bg-muted/30 rounded p-2 max-h-40 overflow-y-auto">
                    {simResult}
                  </pre>
                )}
              </div>

              {/* Reset DB */}
              <button
                type="button"
                onClick={() => void resetSandbox()}
                className="w-full py-2 text-[10px] font-bold uppercase text-destructive border border-destructive/40 rounded-lg hover:bg-destructive/10"
              >
                Limpar rodadas sandbox (DB)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CTA fixo */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-4xl xl:max-w-6xl mx-auto">
          <button
            type="button"
            disabled={!canPlay}
            onClick={() => void startPlay()}
            className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 border ${
              canPlay
                ? "bg-[hsl(140_85%_48%)] border-[hsl(140_90%_55%)] text-background shadow-[0_0_20px_hsl(140_90%_45%/0.4)]"
                : "bg-muted border-border text-muted-foreground cursor-not-allowed"
            }`}
          >
            {busy ? "Iniciando..." : !bet ? "Selecione um valor" : "JOGAR"}
          </button>
        </div>
      </div>
    </div>
  );
};
