import { useState } from "react";
import { createPortal } from "react-dom";
import { Flame, X, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { trackMetaCustom } from "@/lib/metaPixel";

const REWARDS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5];

interface Props {
  currentStreak: number;
  onClaimed: (newStreak: number, amount: number) => void;
  onClose: () => void;
}

/** Popup de login diário com 7 dias visíveis e streak destacado. */
export function DailyLoginPopup({ currentStreak, onClaimed, onClose }: Props) {
  const [loading, setLoading] = useState(false);

  const nextDay = Math.min(7, currentStreak + 1);

  const handleClaim = async () => {
    setLoading(true);
    try {
      const deviceFp = localStorage.getItem("ns_device_fp") || crypto.randomUUID();
      localStorage.setItem("ns_device_fp", deviceFp);
      const { data, error } = await supabase.functions.invoke("claim-daily-login", {
        headers: { "x-device-fingerprint": deviceFp },
      });
      if (error) throw error;
      if (!data?.ok) {
        const msg = (data as { error?: string } | null)?.error;
        if (msg === "already_claimed_today") {
          toast({ title: "Já resgatado hoje", description: "Volte amanhã para continuar a sequência." });
          onClose();
          return;
        }
        throw new Error(msg ?? "unknown");
      }
      toast({
        title: `🔥 Dia ${data.streak_day}!`,
        description: `+R$ ${Number(data.bonus_amount).toFixed(2)} em saldo bônus.`,
      });
      trackMetaCustom("DailyLoginClaimed", {
        value: Number(data.bonus_amount),
        currency: "BRL",
        streak_day: data.streak_day,
      });
      onClaimed(data.streak_day, Number(data.bonus_amount));
    } catch (e) {
      console.error(e);
      toast({ title: "Erro ao resgatar", description: "Tente novamente.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative mx-4 max-w-sm w-full rounded-2xl border-2 border-[hsl(20_85%_55%/0.5)] bg-gradient-to-br from-[hsl(20_50%_12%)] to-[hsl(0_40%_10%)] p-6 shadow-[0_0_60px_-10px_hsl(20_85%_55%/0.6)]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[hsl(20_85%_55%/0.2)] mb-2">
            <Flame size={28} className="text-[hsl(20_95%_65%)]" />
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[hsl(20_95%_65%)]">
            Login diário
          </div>
          <div className="text-2xl font-black text-foreground mt-1">
            Dia {nextDay} da sequência
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Volte todo dia para acumular bônus crescentes
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-5">
          {REWARDS.map((amount, i) => {
            const day = i + 1;
            const claimed = day <= currentStreak;
            const today = day === nextDay;
            return (
              <div
                key={day}
                className={`rounded-lg p-1.5 text-center border ${
                  today
                    ? "border-[hsl(20_95%_60%)] bg-[hsl(20_85%_55%/0.25)] shadow-[0_0_12px_hsl(20_85%_55%/0.5)]"
                    : claimed
                      ? "border-[hsl(140_60%_40%/0.5)] bg-[hsl(140_30%_15%/0.5)]"
                      : "border-border bg-card/30"
                }`}
              >
                <div className="text-[8px] uppercase tracking-wider text-muted-foreground">D{day}</div>
                <div className="text-[10px] font-black tabular-nums mt-0.5 leading-tight">
                  {claimed ? <Check size={12} className="mx-auto text-[hsl(140_70%_55%)]" /> : `${amount.toFixed(2)}`}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleClaim}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-[hsl(20_95%_55%)] text-[hsl(20_40%_10%)] font-black uppercase tracking-widest text-sm hover:bg-[hsl(20_95%_60%)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} />}
          Resgatar R$ {REWARDS[nextDay - 1].toFixed(2)}
        </button>
      </div>
    </div>,
    document.body,
  );
}
