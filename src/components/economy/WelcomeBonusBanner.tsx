import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  onClaimed: () => void;
}

/**
 * Banner exibido no Lobby para usuários que ainda não resgataram o bônus
 * de boas-vindas (R$ 1 + 3 rodadas grátis, rollover 10×).
 */
export function WelcomeBonusBanner({ onClaimed }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClaim = async () => {
    setLoading(true);
    try {
      const deviceFp = localStorage.getItem("ns_device_fp") || crypto.randomUUID();
      localStorage.setItem("ns_device_fp", deviceFp);

      const { data, error } = await supabase.functions.invoke("claim-welcome-bonus", {
        headers: { "x-device-fingerprint": deviceFp },
      });
      if (error) throw error;
      if (!data?.ok) {
        const msg = (data as { error?: string } | null)?.error;
        if (msg === "already_claimed" || msg === "device_already_claimed") {
          toast({ title: "Bônus já resgatado", description: "Esta conta ou dispositivo já recebeu o bônus." });
          onClaimed();
          return;
        }
        if (msg === "age_required") {
          toast({ title: "Confirme idade", description: "Confirme que você tem 18+ para resgatar.", variant: "destructive" });
          return;
        }
        throw new Error(msg ?? "unknown");
      }
      toast({
        title: "🎉 Bônus liberado!",
        description: `R$ ${data.bonus_amount.toFixed(2)} de bônus + ${data.free_spins} rodadas grátis. Aposte R$ ${(data.bonus_amount * data.rollover_multiplier).toFixed(2)} para sacar.`,
      });
      onClaimed();
    } catch (e) {
      console.error(e);
      toast({ title: "Não foi possível resgatar", description: "Tente novamente em instantes.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-[hsl(45_95%_55%/0.6)] bg-gradient-to-br from-[hsl(45_50%_15%)] via-[hsl(36_45%_12%)] to-[hsl(20_40%_10%)] p-4 shadow-[0_0_30px_-8px_hsl(45_95%_55%/0.5)]">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-[hsl(45_95%_55%/0.25)] flex items-center justify-center shrink-0">
          <Gift size={26} className="text-[hsl(45_95%_65%)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-[hsl(45_95%_65%)] font-black">
            Presente de boas-vindas
          </div>
          <div className="text-base font-black text-foreground mt-0.5">
            R$ 1,00 + 3 rodadas grátis
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Para sacar o bônus, aposte R$ 10 em qualquer rodada (rollover 10×).
          </div>
        </div>
      </div>
      <button
        onClick={handleClaim}
        disabled={loading}
        className="mt-3 w-full py-2.5 rounded-xl bg-[hsl(45_95%_55%)] text-[hsl(20_40%_10%)] font-black uppercase tracking-widest text-sm hover:bg-[hsl(45_95%_60%)] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Gift size={16} />}
        Resgatar agora
      </button>
    </div>
  );
}
