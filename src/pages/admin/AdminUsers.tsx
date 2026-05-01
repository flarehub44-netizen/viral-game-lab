import { useState } from "react";
import { toast } from "sonner";
import { invokeAdminAction, type AdminSearchRow } from "@/lib/adminAction";

export const AdminUsers = () => {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [creditFor, setCreditFor] = useState<string | null>(null);
  const [creditAmt, setCreditAmt] = useState("10");
  const [debitFor, setDebitFor] = useState<string | null>(null);
  const [debitAmt, setDebitAmt] = useState("5");

  const search = async () => {
    setLoading(true);
    try {
      const res = await invokeAdminAction<{ ok: boolean; rows: AdminSearchRow[] }>({
        type: "search_users",
        query: q.trim(),
        limit: 40,
      });
      setRows(res.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Busca falhou");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const doCredit = async (userId: string) => {
    const amt = Math.round(Number(creditAmt.replace(",", ".")) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await invokeAdminAction({ type: "credit", user_id: userId, amount: amt, note: "admin_panel" });
      toast.success("Crédito aplicado");
      setCreditFor(null);
      await search();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  const doDebit = async (userId: string) => {
    const amt = Math.round(Number(debitAmt.replace(",", ".")) * 100) / 100;
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await invokeAdminAction({ type: "debit", user_id: userId, amount: amt, note: "admin_panel" });
      toast.success("Débito aplicado");
      setDebitFor(null);
      await search();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
      toast.success("OK");
      await search();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  return (
    <div className="space-y-4 px-4 py-6 max-w-4xl xl:max-w-6xl mx-auto pb-24">
      <h1 className="text-xl font-black uppercase tracking-wide">Usuários</h1>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="E-mail, apelido ou UUID"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={loading}
          onClick={() => void search()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold"
        >
          Buscar
        </button>
      </div>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.user_id} className="rounded-xl border border-border bg-card/40 p-3 text-sm space-y-2">
            <div className="font-mono text-[10px] text-muted-foreground break-all">{r.user_id}</div>
            <div>
              <span className="font-bold">{r.display_name || "—"}</span>{" "}
              <span className="text-muted-foreground">{r.email}</span>
            </div>
            <div className="text-xs tabular-nums">
              Saldo R$ {Number(r.balance).toFixed(2)} · KYC <strong>{r.kyc_status}</strong>
              {r.is_admin && <span className="text-[hsl(280_90%_65%)]"> · admin</span>}
              {r.deleted_at && <span className="text-destructive"> · banido</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {creditFor === r.user_id ? (
                <>
                  <input
                    value={creditAmt}
                    onChange={(e) => setCreditAmt(e.target.value)}
                    className="w-20 rounded border border-border px-1 py-0.5 text-xs"
                  />
                  <button
                    type="button"
                    className="text-xs font-bold text-[hsl(140_90%_62%)]"
                    onClick={() => void doCredit(r.user_id)}
                  >
                    Confirmar crédito
                  </button>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setCreditFor(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-[hsl(140_50%_35%)]"
                  onClick={() => setCreditFor(r.user_id)}
                >
                  Creditar
                </button>
              )}
              {debitFor === r.user_id ? (
                <>
                  <input
                    value={debitAmt}
                    onChange={(e) => setDebitAmt(e.target.value)}
                    className="w-20 rounded border border-border px-1 py-0.5 text-xs"
                  />
                  <button
                    type="button"
                    className="text-xs font-bold text-amber-400"
                    onClick={() => void doDebit(r.user_id)}
                  >
                    Confirmar débito
                  </button>
                  <button type="button" className="text-xs text-muted-foreground" onClick={() => setDebitFor(null)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-border"
                  onClick={() => setDebitFor(r.user_id)}
                >
                  Debitar
                </button>
              )}
              <button
                type="button"
                className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-border"
                onClick={() =>
                  void act(() =>
                    invokeAdminAction({ type: "approve_kyc", user_id: r.user_id }),
                  )
                }
              >
                Aprovar KYC
              </button>
              <button
                type="button"
                className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-border"
                onClick={() =>
                  void act(() =>
                    invokeAdminAction({ type: "set_age_confirmed", user_id: r.user_id, confirmed: true }),
                  )
                }
              >
                18+ OK
              </button>
              <button
                type="button"
                className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-border"
                onClick={() =>
                  void act(() =>
                    invokeAdminAction({ type: "set_age_confirmed", user_id: r.user_id, confirmed: false }),
                  )
                }
              >
                18+ limpar
              </button>
              <button
                type="button"
                className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-destructive/50 text-destructive"
                onClick={() => {
                  if (!window.confirm(`Banir usuário ${r.email}?`)) return;
                  void act(() => invokeAdminAction({ type: "ban_user", user_id: r.user_id }));
                }}
              >
                Banir
              </button>
              <button
                type="button"
                className="text-[10px] uppercase font-bold px-2 py-1 rounded border border-border"
                onClick={() => {
                  if (!window.confirm(`Desbanir ${r.email}?`)) return;
                  void act(() => invokeAdminAction({ type: "unban_user", user_id: r.user_id }));
                }}
              >
                Desbanir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
