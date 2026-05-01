import { useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  onConfirmed: () => void;
}

export const AgeGateScreen = ({ onConfirmed }: Props) => {
  const { user, signOut } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!confirmed || !user) {
      toast.error("Confirme que você tem 18 anos ou mais.");
      return;
    }
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      const { error } = await supabase
        .from("profiles")
        .update({ over_18_confirmed_at: ts })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Perfil atualizado.");
      onConfirmed();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md md:max-w-lg space-y-6">
        <h1 className="text-2xl font-black text-center">Confirmação de idade</h1>
        <p className="text-sm text-muted-foreground text-center leading-relaxed">
          Este jogo envolve apostas simuladas em créditos e não é destinado a menores de 18 anos. Confirme que
          você é maior de idade conforme a legislação aplicável.
        </p>
        <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-card/40 p-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="text-sm">
            Declaro ter <strong>18 anos ou mais</strong> e aceito os termos deste MVP.
          </span>
        </label>
        <button
          type="button"
          disabled={busy || !confirmed}
          onClick={submit}
          className="btn-neon w-full py-3 rounded-xl font-black uppercase tracking-widest text-sm disabled:opacity-40"
        >
          {busy ? "Salvando..." : "Continuar"}
        </button>
        <button
          type="button"
          onClick={() => signOut()}
          className="w-full py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
};
