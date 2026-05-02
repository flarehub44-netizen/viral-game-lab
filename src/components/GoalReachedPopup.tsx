import { createPortal } from "react-dom";

interface GoalReachedPopupProps {
  multiplier: number;
  barriers: number;
  onContinue: () => void;
}

/**
 * Popup obrigatório exibido ao final da rodada quando o jogador ganhou um
 * multiplicador. Só pode ser fechado pelo botão "Fechar" — sem auto-dismiss
 * e sem fechar ao clicar fora.
 */
export function GoalReachedPopup({ multiplier, barriers, onContinue }: GoalReachedPopupProps) {
  // Multiplicador como porcentagem (×1.50 → 150%).
  const percent = Math.round(multiplier * 100);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-live="assertive"
    >
      <div className="relative mx-6 max-w-sm w-full rounded-2xl border border-primary/60 bg-gradient-to-br from-background to-primary/10 p-8 text-center shadow-[0_0_60px_-10px_hsl(var(--primary)/0.6)] animate-in zoom-in-95 duration-300">
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">Parabéns!</div>
        <div className="text-5xl mb-4">🎉</div>
        <div className="text-base text-foreground mb-2">Você ganhou um multiplicador de</div>
        <div className="text-4xl font-bold text-primary mb-2">{percent}%</div>
        <div className="text-xs text-muted-foreground mb-6">
          ×{multiplier.toFixed(2)}
        </div>
        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black uppercase tracking-widest text-sm hover:bg-primary/90 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
