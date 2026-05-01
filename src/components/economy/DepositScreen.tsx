import { ArrowLeft, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { usePixDepositPolling } from "@/hooks/usePixDepositPolling";
import { parsePixInvokeError, toastPixEdgeError } from "@/lib/pixEdgeErrors";
import { supabase } from "@/lib/supabaseExternal";

interface Props {
  onBack: () => void;
  onConfirmed: () => void | Promise<void>;
}

const PRESETS = [10, 25, 50, 100];

export const DepositScreen = ({ onBack, onConfirmed }: Props) => {
  const [amountStr, setAmountStr] = useState("25");
  const [busy, setBusy] = useState(false);
  const [depositId, setDepositId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const { status: pollStatus, pollError } = usePixDepositPolling(depositId);

  const expiresMs = useMemo(() => (expiresAt ? Date.parse(expiresAt) : 0), [expiresAt]);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);

  const secondsLeft = useMemo(() => {
    if (!expiresMs) return 0;
    return Math.max(0, Math.ceil((expiresMs - nowTick) / 1000));
  }, [expiresMs, nowTick]);

  useEffect(() => {
    if (!depositId) return;
    if (pollError) {
      toast.error("Não foi possível acompanhar o status do depósito. Verifique sua carteira em instantes.");
      setDepositId(null);
      setQrCode("");
      setExpiresAt(null);
      return;
    }
    if (pollStatus === "confirmed") {
      toast.success("Depósito confirmado! Seu saldo foi atualizado.");
      void onConfirmed();
      setDepositId(null);
      setQrCode("");
      setExpiresAt(null);
      onBack();
      return;
    }
    if (pollStatus === "failed" || pollStatus === "expired") {
      toast.error(pollStatus === "expired" ? "PIX expirado. Gere um novo código." : "Depósito não concluído.");
      setDepositId(null);
      setQrCode("");
      setExpiresAt(null);
    }
  }, [pollStatus, pollError, depositId, onBack, onConfirmed]);

  const amountNum = Math.round(Number(amountStr.replace(",", ".")) * 100) / 100;

  const generate = async () => {
    if (!Number.isFinite(amountNum) || amountNum < 5 || amountNum > 5000) {
      toast.error("Valor entre R$ 5,00 e R$ 5.000,00.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-pix-deposit", {
        body: { amount: amountNum },
      });
      const errCode = await parsePixInvokeError(data, error);
      if (errCode) {
        toastPixEdgeError(errCode);
        return;
      }
      const d = data as {
        ok?: boolean;
        deposit_id?: string;
        qr_code?: string;
        expires_at?: string;
      };
      if (!d?.ok || !d.deposit_id || !d.qr_code) {
        toast.error("Resposta inválida do servidor.");
        return;
      }
      setDepositId(d.deposit_id);
      setQrCode(d.qr_code);
      setExpiresAt(d.expires_at ?? null);
      toast.message("PIX gerado. Pague no app do seu banco.");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!qrCode) return;
    try {
      await navigator.clipboard.writeText(qrCode);
      toast.success("Código PIX copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
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
        <h2 className="text-lg font-black uppercase tracking-wide">Depósito PIX</h2>
      </div>

      <div className="flex-1 px-5 py-6 space-y-5 w-full">
        {!qrCode ? (
          <>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Escolha o valor. Após gerar o PIX, você tem ~15 minutos para pagar.
            </p>
            <label className="block space-y-1.5">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Valor (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full rounded-xl border border-border bg-background/80 px-3 py-3 text-lg font-black tabular-nums"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountStr(String(v))}
                  className="px-3 py-2 rounded-lg border border-border bg-card/50 text-xs font-bold tabular-nums hover:bg-card/80"
                >
                  R$ {v}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void generate()}
              className="w-full py-3.5 rounded-2xl bg-[hsl(140_85%_48%)] hover:bg-[hsl(140_85%_42%)] text-background font-black uppercase tracking-widest text-sm disabled:opacity-50"
            >
              {busy ? "Gerando…" : "Gerar PIX"}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card/40 p-4">
              <div className="rounded-xl bg-white p-3">
                <QRCodeSVG value={qrCode} size={200} level="M" />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Aguardando pagamento · {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Copia e cola</div>
              <p className="text-[10px] font-mono break-all max-h-24 overflow-y-auto leading-snug">{qrCode}</p>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="w-full py-2 rounded-lg border border-[hsl(140_80%_45%)] bg-[hsl(140_25%_12%)] text-[hsl(140_90%_65%)] text-xs font-bold uppercase flex items-center justify-center gap-2"
              >
                <Copy size={14} />
                Copiar código
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              O saldo atualiza automaticamente quando o pagamento for confirmado.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
