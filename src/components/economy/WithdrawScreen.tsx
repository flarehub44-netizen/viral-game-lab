import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { isValidCpf, onlyDigits } from "@/lib/cpf";
import { parsePixInvokeError, toastPixEdgeError } from "@/lib/pixEdgeErrors";
import { supabase } from "@/lib/supabaseExternal";

type PixKeyTypeUi = "cpf" | "email" | "phone" | "evp";

interface Props {
  walletBalance: number;
  kycApproved: boolean;
  over18: boolean;
  onBack: () => void;
  onRequested: () => void | Promise<void>;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePixKey(pixKey: string, pixKeyType: PixKeyTypeUi): string | null {
  if (pixKeyType === "cpf") {
    const digits = onlyDigits(pixKey);
    if (!isValidCpf(digits)) return "invalid_cpf_pix_key";
  } else if (pixKeyType === "email") {
    if (!RE_EMAIL.test(pixKey.trim())) return "invalid_email_pix_key";
  } else if (pixKeyType === "phone") {
    const digits = onlyDigits(pixKey);
    if (digits.length < 10 || digits.length > 11) return "invalid_phone_pix_key";
  } else if (pixKeyType === "evp") {
    if (!RE_EVP.test(pixKey.trim())) return "invalid_evp_pix_key";
  }
  return null;
}

export const WithdrawScreen = ({ walletBalance, kycApproved, over18, onBack, onRequested }: Props) => {
  const [amountStr, setAmountStr] = useState("");
  const [pixKeyType, setPixKeyType] = useState<PixKeyTypeUi>("cpf");
  const [pixKey, setPixKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [doneRef, setDoneRef] = useState<string | null>(null);

  const amountNum = Math.round(Number(amountStr.replace(",", ".")) * 100) / 100;

  const submit = async () => {
    if (!over18) {
      toast.error("Confirme que você tem 18+ antes de sacar.");
      return;
    }
    if (!kycApproved) {
      toast.error("Saque disponível após aprovação do KYC na plataforma.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum < 5 || amountNum > 5000) {
      toast.error("Valor entre R$ 5,00 e R$ 5.000,00.");
      return;
    }
    if (amountNum > walletBalance + 1e-6) {
      toast.error("Saldo insuficiente.");
      return;
    }
    const trimmedKey = pixKey.trim();
    const v = validatePixKey(trimmedKey, pixKeyType);
    if (v) {
      toastPixEdgeError(v);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("request-pix-withdrawal", {
        body: {
          amount: amountNum,
          pix_key: trimmedKey,
          pix_key_type: pixKeyType,
        },
      });
      const errCode = await parsePixInvokeError(data, error);
      if (errCode) {
        toastPixEdgeError(errCode);
        return;
      }
      const d = data as { ok?: boolean; provider_ref?: string };
      if (!d?.ok) {
        toast.error("Não foi possível solicitar o saque.");
        return;
      }
      setDoneRef(d.provider_ref ?? "ok");
      toast.success("Saque solicitado. Acompanhe o status na carteira.");
      await onRequested();
    } finally {
      setBusy(false);
    }
  };

  if (doneRef) {
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
          <h2 className="text-lg font-black uppercase tracking-wide">Saque PIX</h2>
        </div>
        <div className="flex-1 px-5 py-8 space-y-4 max-w-md mx-auto w-full text-center">
          <p className="text-sm text-[hsl(140_90%_62%)] font-bold">Pedido registrado</p>
          {doneRef !== "ok" && (
            <p className="text-[10px] font-mono break-all text-muted-foreground">
              Ref. provedor: {doneRef}
            </p>
          )}
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-card border border-border font-bold text-sm"
          >
            Voltar à carteira
          </button>
        </div>
      </div>
    );
  }

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
        <h2 className="text-lg font-black uppercase tracking-wide">Saque PIX</h2>
      </div>

      <div className="flex-1 px-5 py-6 space-y-5 max-w-md mx-auto w-full">
        {(!over18 || !kycApproved) && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
            {!over18 && <p>Confirme a maioridade (18+) no app antes de solicitar saque.</p>}
            {over18 && !kycApproved && (
              <p>
                Saque liberado após KYC <strong>aprovado</strong>. Entre em contato com o suporte da plataforma se
                precisar enviar documentos.
              </p>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Saldo disponível:{" "}
          <span className="text-foreground font-black tabular-nums">
            R${" "}
            {walletBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </p>

        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="Ex: 50"
            className="w-full rounded-xl border border-border bg-background/80 px-3 py-3 text-lg font-black tabular-nums"
          />
        </label>

        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Tipo de chave PIX</span>
          <div className="grid grid-cols-2 gap-2">
            {(["cpf", "email", "phone", "evp"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPixKeyType(t)}
                className={`py-2 rounded-lg border text-[10px] font-bold uppercase ${
                  pixKeyType === t
                    ? "border-[hsl(180_70%_50%)] bg-[hsl(195_35%_14%)] text-[hsl(180_90%_70%)]"
                    : "border-border bg-card/40 text-muted-foreground"
                }`}
              >
                {t === "cpf" ? "CPF" : t === "email" ? "E-mail" : t === "phone" ? "Celular" : "Aleatória"}
              </button>
            ))}
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Chave PIX</span>
          <input
            type="text"
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder={
              pixKeyType === "cpf"
                ? "000.000.000-00"
                : pixKeyType === "email"
                  ? "email@exemplo.com"
                  : pixKeyType === "phone"
                    ? "(11) 98765-4321"
                    : "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            }
            className="w-full rounded-xl border border-border bg-background/80 px-3 py-3 text-sm"
          />
        </label>

        <button
          type="button"
          disabled={busy || !over18 || !kycApproved}
          onClick={() => void submit()}
          className="w-full py-3.5 rounded-2xl bg-[hsl(195_80%_42%)] hover:bg-[hsl(195_80%_36%)] text-background font-black uppercase tracking-widest text-sm disabled:opacity-40"
        >
          {busy ? "Enviando…" : "Solicitar saque"}
        </button>
      </div>
    </div>
  );
};
