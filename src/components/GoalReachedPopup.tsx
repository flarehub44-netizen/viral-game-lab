import { useEffect } from "react";

interface GoalReachedPopupProps {
  multiplier: number;
  barriers: number;
  onContinue: () => void;
  autoDismissMs?: number;
}

/**
 * Popup exibido quando o jogador bate a meta de barreiras (demo ou live),
 * antes de transicionar para a tela de Fim de Jogo.
 */
export function GoalReachedPopup({
  multiplier,
  barriers,
  onContinue,
  autoDismissMs = 2200,
}: GoalReachedPopupProps) {
  useEffect(() => {
    const t = window.setTimeout(onContinue, autoDismissMs);
    return () => window.clearTimeout(t);
  }, [onContinue, autoDismissMs]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onContinue}
      role="dialog"
      aria-live="assertive"
    >
      <div className="relative mx-6 max-w-sm w-full rounded-2xl border border-primary/60 bg-gradient-to-br from-background to-primary/10 p-8 text-center shadow-[0_0_60px_-10px_hsl(var(--primary)/0.6)] animate-in zoom-in-95 duration-300">
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">Meta batida!</div>
        <div className="text-5xl mb-3">🎯</div>
        <div className="text-3xl font-bold text-primary mb-2">×{multiplier.toFixed(2)}</div>
        <div className="text-sm text-muted-foreground">
          {barriers} barreiras concluídas
        </div>
        <div className="mt-5 text-[11px] text-muted-foreground/70">Toque para continuar</div>
      </div>
    </div>
  );
}
