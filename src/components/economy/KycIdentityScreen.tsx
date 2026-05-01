import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseExternal";
import { isValidCpf, onlyDigits } from "@/lib/cpf";

interface Props {
  onBack: () => void;
  onSaved: () => void | Promise<void>;
}

function formatCpfDisplay(digits: string): string {
  const d = onlyDigits(digits).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  if (d.length <= 3) return p1;
  if (d.length <= 6) return `${p1}.${p2}`;
  if (d.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

function formatPhoneDisplay(digits: string): string {
  const d = onlyDigits(digits).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

export const KycIdentityScreen = ({ onBack, onSaved }: Props) => {
  const [cpfDisplay, setCpfDisplay] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cpf = onlyDigits(cpfDisplay);
    const phone = onlyDigits(phoneDisplay);
    if (!isValidCpf(cpf)) {
      toast.error("CPF inválido. Confira os dígitos.");
      return;
    }
    if (phone.length < 10 || phone.length > 11) {
      toast.error("Celular com DDD: 10 ou 11 dígitos.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("set_profile_pix_identity", {
        p_cpf: cpf,
        p_phone: phone,
      });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("cpf_already_used")) toast.error("Este CPF já está em outra conta.");
        else if (msg.includes("invalid_cpf")) toast.error("CPF inválido.");
        else if (msg.includes("invalid_phone")) toast.error("Telefone inválido.");
        else toast.error(msg || "Não foi possível salvar.");
        return;
      }
      toast.success("Dados salvos.");
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background overflow-y-auto">
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 border-b border-border shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-black uppercase tracking-wide">Dados PIX</h2>
      </div>

      <div className="flex-1 px-5 py-6 space-y-5 max-w-md mx-auto w-full">
        <p className="text-[11px] text-muted-foreground leading-relaxed border border-border rounded-lg p-3 bg-card/30">
          Informe CPF e celular usados na cobrança PIX. Os dados ficam no seu perfil e são exigidos pelo
          provedor de pagamento.
        </p>

        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">CPF</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpfDisplay}
            onChange={(e) => setCpfDisplay(formatCpfDisplay(e.target.value))}
            placeholder="000.000.000-00"
            className="w-full rounded-xl border border-border bg-background/80 px-3 py-3 text-sm font-mono"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Celular (com DDD)</span>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phoneDisplay}
            onChange={(e) => setPhoneDisplay(formatPhoneDisplay(e.target.value))}
            placeholder="(11) 98765-4321"
            className="w-full rounded-xl border border-border bg-background/80 px-3 py-3 text-sm font-mono"
          />
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="w-full py-3.5 rounded-2xl bg-[hsl(140_85%_48%)] hover:bg-[hsl(140_85%_42%)] text-background font-black uppercase tracking-widest text-sm disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Salvar e continuar"}
        </button>
      </div>
    </div>
  );
};
