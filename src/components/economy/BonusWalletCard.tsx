import { Sparkles } from "lucide-react";
import type { WalletBonusInfo } from "@/hooks/useBonusWallet";

interface Props {
  info: WalletBonusInfo;
}

/** Card mostrando saldo bônus + progresso de rollover. */
export function BonusWalletCard({ info }: Props) {
  if (info.bonus_balance <= 0 && info.bonus_rollover_required <= 0 && info.free_spins_remaining <= 0) {
    return null;
  }

  const required = info.bonus_rollover_required;
  const progress = Math.min(info.bonus_rollover_progress, required);
  const pct = required > 0 ? Math.min(100, (progress / required) * 100) : 100;
  const remaining = Math.max(0, required - progress);

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-2xl border-2 border-[hsl(45_95%_55%/0.4)] bg-gradient-to-br from-[hsl(45_50%_12%)] to-[hsl(36_45%_10%)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[hsl(45_95%_65%)]" />
          <div className="text-[10px] uppercase tracking-widest text-[hsl(45_95%_65%)] font-black">
            Saldo Bônus
          </div>
        </div>
        {info.free_spins_remaining > 0 && (
          <div className="text-[10px] uppercase tracking-wide font-black text-[hsl(45_95%_65%)] bg-[hsl(45_95%_55%/0.2)] rounded-full px-2 py-0.5">
            {info.free_spins_remaining} grátis
          </div>
        )}
      </div>

      <div className="text-3xl font-black tabular-nums text-foreground">
        R$ {fmt(info.bonus_balance)}
      </div>

      {required > 0 && (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
              <span>Progresso de saque</span>
              <span className="tabular-nums">
                R$ {fmt(progress)} / R$ {fmt(required)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[hsl(45_95%_55%)] to-[hsl(36_95%_55%)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          {remaining > 0 ? (
            <div className="text-[11px] text-muted-foreground leading-snug">
              Aposte mais <span className="font-black text-[hsl(45_95%_65%)]">R$ {fmt(remaining)}</span> em rodadas para liberar o bônus como saldo real.
            </div>
          ) : (
            <div className="text-[11px] text-[hsl(140_70%_55%)] font-bold leading-snug">
              ✓ Rollover concluído! O bônus será convertido em saldo real na próxima rodada.
            </div>
          )}
        </>
      )}
    </div>
  );
}
