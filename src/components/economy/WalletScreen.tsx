import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoundHistoryRow } from "@/game/economy/serverRound";

export type PixDepositRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  confirmed_at: string | null;
};

export type PixWithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  provider_ref: string | null;
};

interface Props {
  balance: number;
  history: RoundHistoryRow[];
  loading?: boolean;
  onBack: () => void;
  variant?: "demo" | "online";
  onDeposit?: () => void;
  onWithdraw?: () => void;
  pixDeposits?: PixDepositRow[];
  pixWithdrawals?: PixWithdrawalRow[];
  onReconcilePending?: (depositId?: string) => Promise<void> | void;
}

function pixStatusLabel(kind: "dep" | "wd", status: string): string {
  if (kind === "dep") {
    const m: Record<string, string> = {
      pending: "Aguardando PIX",
      confirmed: "Confirmado",
      failed: "Falhou",
      expired: "Expirado",
    };
    return m[status] ?? status;
  }
  const m: Record<string, string> = {
    requested: "Solicitado",
    processing: "Processando",
    paid: "Pago",
    failed: "Falhou",
    reversed: "Estornado",
  };
  return m[status] ?? status;
}

function pixStatusClass(status: string): string {
  if (status === "confirmed" || status === "paid") return "text-[hsl(140_90%_62%)] border-[hsl(140_50%_35%/0.5)]";
  if (status === "failed" || status === "expired" || status === "reversed") {
    return "text-destructive border-destructive/40";
  }
  return "text-amber-300 border-amber-500/35";
}

export const WalletScreen = ({
  balance,
  history,
  loading,
  onBack,
  variant = "online",
  onDeposit,
  onWithdraw,
  pixDeposits = [],
  pixWithdrawals = [],
}: Props) => {
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  type PixLine = {
    kind: "dep" | "wd";
    id: string;
    created_at: string;
    amount: number;
    status: string;
    provider_ref?: string | null;
  };

  const pixMerged: PixLine[] = [
    ...pixDeposits.map((d) => ({
      kind: "dep" as const,
      id: d.id,
      created_at: d.created_at,
      amount: d.amount,
      status: d.status,
    })),
    ...pixWithdrawals.map((w) => ({
      kind: "wd" as const,
      id: w.id,
      created_at: w.created_at,
      amount: w.amount,
      status: w.status,
      provider_ref: w.provider_ref,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 w-full">
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
          {loading && <div className="text-[10px] text-muted-foreground">Atualizando...</div>}
        </div>

        {variant === "online" && onDeposit && onWithdraw && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onDeposit}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-[hsl(140_85%_42%/0.35)] border border-[hsl(140_80%_45%)] text-[hsl(140_90%_68%)] text-xs font-black uppercase tracking-wide"
            >
              <ArrowDownCircle size={18} />
              Depositar PIX
            </button>
            <button
              type="button"
              onClick={onWithdraw}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl bg-[hsl(195_70%_38%/0.35)] border border-[hsl(195_70%_50%)] text-[hsl(195_90%_72%)] text-xs font-black uppercase tracking-wide"
            >
              <ArrowUpCircle size={18} />
              Sacar PIX
            </button>
          </div>
        )}

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

        {variant === "online" && (
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              Transações PIX
            </div>
            {pixMerged.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground">Nenhum depósito ou saque ainda.</p>
            ) : (
              <ul className="space-y-2">
                {pixMerged.map((row) => (
                  <li
                    key={`${row.kind}-${row.id}`}
                    className="rounded-xl border border-border bg-card/30 px-3 py-3 space-y-1"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(row.created_at).toLocaleString("pt-BR")}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${pixStatusClass(row.status)}`}
                      >
                        {pixStatusLabel(row.kind, row.status)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs tabular-nums">
                      <span className="text-muted-foreground">
                        {row.kind === "dep" ? "Depósito" : "Saque"}
                      </span>
                      <span className={row.kind === "dep" ? "text-[hsl(140_90%_62%)]" : "text-[hsl(195_90%_72%)]"}>
                        {row.kind === "dep" ? "+" : "-"}R$ {fmt(row.amount)}
                      </span>
                    </div>
                    {row.kind === "wd" && row.provider_ref && (
                      <div className="text-[9px] font-mono text-muted-foreground truncate">
                        Ref: {row.provider_ref}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
