import { Trophy, RotateCcw, Home, Sparkles, Award, Check, Coins, Flag, History } from "lucide-react";
import { useEffect, useState } from "react";
import type { PublicGameStats } from "@/game/engine";
import type { ServerEconomyPayload } from "@/game/economy/serverRound";
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
  serverEconomy?: ServerEconomyPayload | null;
  economySource?: "demo" | "server";
  onChangeStake?: () => void;
  onOpenHistory?: () => void;
  barriersPassed?: number;
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
  serverEconomy,
  economySource = "server",
  onChangeStake,
  onOpenHistory,
  barriersPassed,
}: Props) => {
  // Animate XP bar from before -> after
  const [animXp, setAnimXp] = useState(progression?.xpBefore ?? 0);
  // Trava: ignora cliques nos botões por 700ms para evitar tap residual
  // que matou a última bolinha (caso contrário, o usuário pula direto para "Iniciar partida").
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setArmed(true), 700);
    return () => window.clearTimeout(t);
  }, []);
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

  const nearMissMessages: Array<{ key: string; text: string }> = [];
  if (progression) {
    const finalLvl = levelFromXp(progression.xpAfter);
    const xpToNext = finalLvl.needed - finalLvl.intoLevel;
    if (xpToNext > 0 && xpToNext <= Math.ceil(finalLvl.needed * 0.25)) {
      nearMissMessages.push({ key: "xp", text: `Faltaram ${xpToNext} XP para o nível ${finalLvl.level + 1}!` });
    }
    const pending = progression.data.missions.list.filter((m) => !m.done && m.progress > 0);
    if (pending.length > 0) {
      const best = pending.reduce((a, b) => b.progress / b.goal > a.progress / a.goal ? b : a);
      const pct = Math.round((best.progress / best.goal) * 100);
      if (pct >= 50) {
        nearMissMessages.push({ key: best.id, text: `${pct}% em "${best.label}" — quase!` });
      }
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

      {/* HERÓI: Resultado da rodada */}
      {serverEconomy && (
        <div
          className={`mt-4 mx-auto w-full max-w-xs md:max-w-md rounded-2xl border-2 p-5 space-y-4 ${
            serverEconomy.netResult > 0
              ? "border-[hsl(140_80%_45%/0.7)] bg-[hsl(140_25%_8%/0.55)] shadow-[0_0_24px_hsl(140_80%_40%/0.3)]"
              : serverEconomy.netResult === 0
                ? "border-border bg-card/40"
                : "border-destructive/40 bg-card/30 shadow-[0_0_18px_hsl(0_70%_40%/0.2)]"
          }`}
        >
          <div className="text-center text-sm font-black uppercase tracking-[0.25em] text-muted-foreground">
            Resultado da rodada
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <div className="text-[9px] uppercase text-muted-foreground">Entrada</div>
              <div className="text-xl font-bold tabular-nums text-foreground/80 mt-1">
                R$ {fmt(serverEconomy.stake)}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase text-muted-foreground">Pagamento</div>
              <div
                className={`text-4xl font-black tabular-nums leading-tight mt-0.5 ${
                  serverEconomy.payout > 0
                    ? "text-[hsl(140_90%_62%)]"
                    : "text-muted-foreground"
                }`}
                style={{
                  textShadow:
                    serverEconomy.payout > 0
                      ? "0 0 14px hsl(140 90% 50% / 0.55)"
                      : undefined,
                }}
              >
                R$ {fmt(serverEconomy.payout)}
              </div>
            </div>
          </div>
          <div className="text-center pt-2 border-t border-border/40">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Saldo da rodada
            </div>
            <div
              className={`text-3xl font-black tabular-nums leading-tight mt-1 ${
                serverEconomy.netResult > 0
                  ? "text-[hsl(140_90%_62%)]"
                  : serverEconomy.netResult === 0
                    ? "text-foreground"
                    : "text-destructive/90"
              }`}
              style={{
                textShadow:
                  serverEconomy.netResult > 0
                    ? "0 0 12px hsl(140 90% 50% / 0.5)"
                    : undefined,
              }}
            >
              {serverEconomy.netResult > 0 ? "+" : ""}
              R$ {fmt(serverEconomy.netResult)}
            </div>
          </div>
          <p className="text-[10px] text-center text-muted-foreground leading-relaxed px-1">
            {serverEconomy.netResult > 0
              ? "Boa rodada! Quanto mais barreiras você passa, maior o multiplicador."
              : "Cada barreira aumenta seu multiplicador. Continue tentando para chegar mais longe!"}
          </p>
        </div>
      )}

      {/* Stats compactos: Pontos · Recorde · Combo · Tempo */}
      <div className="mt-4 mx-auto w-full max-w-xs md:max-w-md grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Pontos
          </div>
          <div className="text-base font-bold tabular-nums text-foreground/80 mt-0.5">
            {stats.score.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Recorde
          </div>
          <div className="text-base font-bold tabular-nums text-foreground/80 mt-0.5">
            {Math.max(bestScore, stats.score).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Combo
          </div>
          <div className="text-base font-bold tabular-nums text-foreground/80 mt-0.5">
            ×{maxCombo}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
            Tempo
          </div>
          <div className="text-base font-bold tabular-nums text-foreground/80 mt-0.5">
            {stats.durationSeconds}s
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center text-center mt-3">
        {barriersPassed != null && barriersPassed > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs tabular-nums">
            <Flag size={12} className="text-primary" />
            <span className="font-bold">Barreiras: {barriersPassed}</span>
          </div>
        )}
        {progression && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs">
            <Coins size={14} className="text-glow-yellow" />
            <span className="font-bold text-glow-yellow">+{progression.creditsGained} créditos</span>
          </div>
        )}
      </div>


      {/* XP / Level bar */}
      {progression && (
        <div className="mt-5 mx-auto w-full max-w-xs md:max-w-md rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[10px] font-black text-background">
                {lvl.level}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Nível
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1 text-xs font-bold text-glow-yellow tabular-nums">
                <Sparkles size={12} />+{progression.xpGained} XP
              </div>
              {progression.streakXpBonus > 0 && (
                <span className="text-[10px] text-orange-400 font-semibold tabular-nums">
                  +{Math.round(progression.streakXpBonus * 100)}% sequência ({progression.streakDays}d)
                </span>
              )}
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

      {/* Near-miss motivation */}
      {nearMissMessages.length > 0 && (
        <div className="mt-3 mx-auto w-full max-w-xs md:max-w-md flex flex-col gap-1.5">
          {nearMissMessages.slice(0, 2).map(({ key, text }) => (
            <div key={key} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span>⚡</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Missions / Achievements completed */}
      {progression && (progression.missionsCompleted.length > 0 || progression.achievementsUnlocked.length > 0) && (
        <div className="mt-3 mx-auto w-full max-w-xs md:max-w-md flex flex-col gap-2">
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
      {progression && progression.runGoalsCompleted.length > 0 && (
        <div className="mt-3 mx-auto w-full max-w-xs md:max-w-md flex flex-col gap-2">
          {progression.runGoalsCompleted.map((goal) => (
            <div
              key={goal.id}
              className="flex items-center gap-2 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-xs"
            >
              <Flag size={14} className="text-accent" />
              <span className="flex-1">{goal.label}</span>
              <span className="font-bold text-glow-yellow">+{goal.rewardCredits}</span>
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

      <div className={`w-full max-w-xs md:max-w-md mx-auto flex flex-col gap-3 mt-4 transition-opacity ${armed ? "" : "pointer-events-none opacity-60"}`}>
        <button
          onClick={onRetry}
          className="btn-neon w-full py-4 text-lg font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2"
        >
          <RotateCcw size={18} />
          Jogar de novo
        </button>
        {(onChangeStake || onOpenHistory) && (
          <div className="flex gap-2">
            {onChangeStake && (
              <button
                type="button"
                onClick={onChangeStake}
                className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60"
              >
                Alterar entrada
              </button>
            )}
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 flex items-center justify-center gap-1"
              >
                <History size={14} />
                Histórico
              </button>
            )}
          </div>
        )}
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
