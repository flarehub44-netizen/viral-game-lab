import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { invokeAdminAction } from "@/lib/adminAction";

interface PendingRow {
  id: string;
  user_id: string;
  amount: number;
  pix_key: string;
  pix_key_type: string;
  created_at: string;
  status: string;
  display_name: string | null;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const maskKey = (key: string, type: string) => {
  if (type === "cpf") return key.replace(/^(\d{3})\d{6}(\d{2})$/, "$1******$2");
  if (type === "phone") return key.replace(/(\d{2})(\d{4,5})(\d{4})/, "$1*****$3");
  if (type === "email") return key.replace(/^(.).*(@.*)$/, "$1***$2");
  return key.slice(0, 4) + "..." + key.slice(-4);
};

export const AdminWithdrawals = () => {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modal de rejeição
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invokeAdminAction<{ ok: boolean; rows: PendingRow[] }>({
        type: "list_pending_withdrawals",
        limit: 100,
      });
      setRows(res.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar saques");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onApprove = async (id: string) => {
    if (!confirm("Aprovar este saque e enviar ao gateway PIX?")) return;
    setBusyId(id);
    try {
      await invokeAdminAction({ type: "approve_withdrawal", withdrawal_id: id });
      toast.success("Saque aprovado e enviado ao gateway.");
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aprovar");
    } finally {
      setBusyId(null);
    }
  };

  const onConfirmReject = async () => {
    if (!rejectId) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      toast.error("Motivo precisa ter pelo menos 3 caracteres.");
      return;
    }
    setBusyId(rejectId);
    try {
      await invokeAdminAction({
        type: "reject_withdrawal",
        withdrawal_id: rejectId,
        reason,
      });
      toast.success("Saque rejeitado e saldo estornado.");
      setRows((r) => r.filter((x) => x.id !== rejectId));
      setRejectId(null);
      setRejectReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao rejeitar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="px-4 py-5 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-black uppercase tracking-wide">
          Saques pendentes de aprovação
        </h1>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card/40 text-[11px] font-bold uppercase text-muted-foreground hover:text-foreground"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">
          <Loader2 size={20} className="animate-spin inline-block mr-2" />
          Carregando saques…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 text-sm border border-dashed border-border rounded-xl">
          Nenhum saque pendente no momento.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-border bg-card/30 p-3 flex flex-col sm:flex-row gap-3 sm:items-center"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-black tabular-nums text-foreground">
                    R$ {fmtBRL(Number(row.amount))}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {fmtDate(row.created_at)}
                  </span>
                </div>
                <div className="text-xs text-foreground/90 truncate">
                  <span className="text-muted-foreground">Jogador:</span>{" "}
                  {row.display_name ?? <span className="font-mono text-[10px]">{row.user_id}</span>}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  <span className="uppercase tracking-wider">{row.pix_key_type}</span>{" "}
                  · <span className="font-mono">{maskKey(row.pix_key, row.pix_key_type)}</span>
                </div>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void onApprove(row.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[hsl(140_70%_45%/0.5)] bg-[hsl(140_30%_10%/0.5)] text-[11px] font-black uppercase text-[hsl(140_90%_70%)] disabled:opacity-40"
                >
                  <Check size={12} /> Aprovar
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => {
                    setRejectId(row.id);
                    setRejectReason("");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-destructive/40 bg-destructive/10 text-[11px] font-black uppercase text-destructive disabled:opacity-40"
                >
                  <X size={12} /> Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de rejeição */}
      {rejectId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="text-sm font-black uppercase tracking-wide">
              Rejeitar saque
            </h2>
            <p className="text-xs text-muted-foreground">
              Informe o motivo da rejeição. O valor será estornado para a carteira do jogador automaticamente.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value.slice(0, 500))}
              placeholder="Ex: Documentos inconsistentes, suspeita de fraude…"
              className="w-full min-h-[100px] rounded-lg border border-border bg-background p-2 text-sm"
              autoFocus
            />
            <div className="text-[10px] text-muted-foreground tabular-nums text-right">
              {rejectReason.length}/500
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRejectId(null);
                  setRejectReason("");
                }}
                disabled={busyId === rejectId}
                className="flex-1 px-3 py-2 rounded-lg border border-border text-xs font-bold uppercase text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void onConfirmReject()}
                disabled={busyId === rejectId || rejectReason.trim().length < 3}
                className="flex-1 px-3 py-2 rounded-lg border border-destructive/60 bg-destructive/15 text-xs font-black uppercase text-destructive disabled:opacity-40"
              >
                {busyId === rejectId ? "Rejeitando…" : "Confirmar rejeição"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default AdminWithdrawals;
