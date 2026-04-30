import { ArrowLeft } from "lucide-react";
import type { RoundHistoryRow } from "@/game/economy/serverRound";

interface Props {
  balance: number;
  history: RoundHistoryRow[];
  loading?: boolean;
  onBack: () => void;
  variant?: "demo" | "online";
}

export const WalletScreen = ({ balance, history, loading, onBack, variant = "online" }: Props) => {
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-black uppercase tracking-wide">Carteira</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 max-w-md mx-auto w-full">
        {variant === "demo" && (
          <p className="text-[10px] rounded-lg border border-[hsl(180_70%_45%/0.35)] bg-[hsl(195_35%_12%/0.5)] px-3 py-2 text-muted-foreground leading-relaxed">
            Modo demo: saldo e histórico ficam só no navegador. Depósitos e saques não existem aqui.
          </p>
        )}
        {variant === "online" && (
          <p className="text-[10px] rounded-lg border border-border bg-card/30 px-3 py-2 text-muted-foreground leading-relaxed">
            Saldo mantido no servidor. Operações financeiras reais seguem políticas da plataforma e da conta.
          </p>
        )}
        <div className="rounded-2xl border border-border bg-card/40 p-6 text-center space-y-2">
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Saldo disponível
          </div>
          <div className="text-4xl font-black tabular-nums text-white">R$ {fmt(balance)}</div>
          {loading && (
            <div className="text-[10px] text-muted-foreground">Atualizando...</div>
          )}
        </div>

        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
            Histórico de rodadas
          </div>
          {history.length === 0 && !loading ? (
            <p className="text-sm text-muted-foreground">Nenhuma rodada registrada ainda.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-border bg-card/30 px-3 py-3 space-y-1"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(row.created_at).toLocaleString("pt-BR")}
                    </span>
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      ×{row.result_multiplier.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs tabular-nums">
                    <span className="text-muted-foreground">Entrada R$ {fmt(row.stake)}</span>
                    <span className="text-[hsl(140_90%_62%)]">Paga R$ {fmt(row.payout)}</span>
                  </div>
                  <div className="text-xs font-bold tabular-nums text-right">
                    Líquido{" "}
                    <span className={row.net_result >= 0 ? "text-[hsl(140_90%_62%)]" : "text-destructive"}>
                      {row.net_result >= 0 ? "+" : ""}
                      R$ {fmt(row.net_result)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
