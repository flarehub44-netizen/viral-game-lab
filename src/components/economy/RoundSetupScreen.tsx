import { ArrowLeft, TrendingUp, Users, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { BET_AMOUNTS, DEFAULT_META_MULTIPLIER } from "@/game/economy/constants";
import { MULTIPLIER_CURVE_HARD_CAP } from "@/game/economy/multiplierCurve";
import { DEMO_DEFAULT_BASE } from "@/game/economy/demoRound";

interface Props {
  balance: number;
  busy?: boolean;
  onBack: () => void;
  /** Valor da entrada (R$ / saldo servidor). */
  onConfirm: (stake: number, targetMultiplier: number) => void;
  economySource: "demo" | "server";
  freeSpinsRemaining?: number;
}

function pseudoOnlinePlayers(): number {
  const d = new Date();
  const daySeed =
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return 300 + (daySeed % 120);
}

export const RoundSetupScreen = ({ balance, busy, onBack, onConfirm, economySource, freeSpinsRemaining = 0 }: Props) => {
  const [bet, setBet] = useState<number>(0);
  const isDemo = economySource === "demo";
  // Demo: base do multiplicador agora é fixa (sem seletor). Live: usa default.
  const meta = isDemo ? DEMO_DEFAULT_BASE : DEFAULT_META_MULTIPLIER;
  const online = pseudoOnlinePlayers();

  const stats = useMemo(() => {
    if (bet <= 0) {
      return {
        metaGain: 0,
        perBarrier: 0,
        platForMeta: 0,
        maxPayout: 0,
      };
    }
    if (isDemo) {
      // Demo: ganho = entrada × 0,05 × base × barreiras
      // Atinge a meta (×base) em DEMO_GOAL_BARRIERS barreiras.
      const perBarrier = bet * DEMO_MULTIPLIER_PER_BARRIER_FACTOR * meta;
      const metaGain = bet * meta;
      return { metaGain, perBarrier, platForMeta: DEMO_GOAL_BARRIERS, maxPayout: 0 };
    }
    // Live: potencial bruto (entrada × multiplicador máximo da curva), sem aplicar o teto aqui.
    // O teto R$ MAX_ROUND_PAYOUT é exibido como referência separada no card.
    const maxPayout = bet * MULTIPLIER_CURVE_HARD_CAP;
    return { metaGain: 0, perBarrier: 0, platForMeta: 0, maxPayout };
  }, [bet, meta, isDemo]);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const hasFreeSpin = economySource === "server" && freeSpinsRemaining > 0;
  const usingFreeSpin = hasFreeSpin && bet === 1;
  // Free spin não exige saldo
  const canPlay = bet > 0 && (usingFreeSpin || balance >= bet) && !busy;
  const insufficient = bet > 0 && !usingFreeSpin && balance < bet;

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background overflow-y-auto">
      <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3 shrink-0 border-b border-border w-full">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-card/50 border border-border text-[10px] text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(140_90%_55%)] animate-pulse" />
          <Users size={12} />
          {online} online
        </div>
      </div>

      <div className="flex-1 px-5 py-6 space-y-6 w-full pb-36">
        <div>
          <h2 className="text-xl font-black uppercase tracking-wide text-center mb-2">
            Iniciar partida
          </h2>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            {economySource === "server"
              ? "Aposte e jogue até perder todas as bolas. Quanto mais barreiras passar, maior o pagamento."
              : "Modo Demo: escolha sua entrada e a base do multiplicador. Cada barreira vale entrada × 0,05 × base."}
          </p>
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Valor de entrada (R$)
          </div>
          {hasFreeSpin && (
            <div className="mb-3 mx-auto max-w-md rounded-xl border border-[hsl(45_95%_55%/0.5)] bg-[hsl(45_60%_15%/0.3)] px-3 py-2 text-[11px] text-[hsl(45_90%_75%)] text-center leading-snug flex items-center justify-center gap-1.5">
              <Sparkles size={12} />
              Você tem <strong>{freeSpinsRemaining} giro{freeSpinsRemaining > 1 ? "s" : ""} grátis</strong> — escolha R$ 1 para usar
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {BET_AMOUNTS.map((amount) => {
              const isFreeOption = hasFreeSpin && amount === 1;
              return (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setBet(amount)}
                  className={`relative min-w-[52px] px-3 py-2 rounded-full border text-sm font-black tabular-nums transition-colors ${
                    bet === amount
                      ? "border-primary bg-primary/20 text-primary shadow-[0_0_16px_hsl(var(--primary)/0.35)]"
                      : isFreeOption
                        ? "border-[hsl(45_95%_55%)] bg-[hsl(45_60%_15%/0.4)] text-[hsl(45_95%_70%)]"
                        : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {amount}
                  {isFreeOption && (
                    <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-[hsl(45_95%_55%)] text-background rounded-full px-1 font-black">
                      FREE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/35 p-6 text-center space-y-1">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Entrada selecionada
          </div>
          <div className="text-4xl font-black tabular-nums text-white">R$ {fmt(bet)}</div>
        </div>

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
            <div className="text-sm font-black tabular-nums text-secondary">
              R$ {fmt(bet > 0 ? bet * MULTIPLIER_CURVE_HARD_CAP : 0)}
            </div>
            <div className="text-[9px] text-secondary/80 font-bold tabular-nums mt-0.5">{"\n"}</div>
          </div>
        </div>

        <p className="text-[11px] text-center text-muted-foreground bg-muted/40 rounded-xl px-3 py-2 border border-border">
          Saldo atual:{" "}
          <span className="text-foreground font-bold tabular-nums">R$ {fmt(balance)}</span>.{" "}
          {economySource === "server"
            ? `Pagamento: entrada × multiplicador da curva.`
            : `Pagamento: entrada × 0,05 × base × barreiras.`}
        </p>

        <p className="text-[10px] text-center text-muted-foreground px-1 leading-relaxed">
          Jogue com responsabilidade. Proibido para menores de 18 anos.
        </p>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent neon-app-column space-y-2">
        <button
          type="button"
          disabled={!bet || insufficient || Boolean(busy)}
          onClick={() => canPlay && onConfirm(bet, meta)}
          className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 border ${
            canPlay
              ? "bg-[hsl(140_85%_48%)] border-[hsl(140_90%_55%)] text-background shadow-[0_0_20px_hsl(140_90%_45%/0.4)]"
              : "bg-muted border-border text-muted-foreground cursor-not-allowed"
          }`}
        >
          {busy
            ? "Iniciando..."
            : !bet
              ? "Selecione um valor"
              : insufficient
                ? "Saldo insuficiente"
                : usingFreeSpin
                  ? "JOGAR (GIRO GRÁTIS)"
                  : "JOGAR"}
        </button>
      </div>
    </div>
  );
};
