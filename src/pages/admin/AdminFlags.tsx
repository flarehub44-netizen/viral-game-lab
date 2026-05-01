import { useEffect, useState } from "react";
import { toast } from "sonner";
import { invokeAdminAction } from "@/lib/adminAction";
import { supabase } from "@/lib/supabaseExternal";

type FlagRow = {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  updated_at: string;
};

export const AdminFlags = () => {
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase.from("feature_flags").select("*").order("key");
    if (error) {
      toast.error("Erro ao carregar flags");
      return;
    }
    setRows((data as FlagRow[]) ?? []);
  };

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await load();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, []);

  const toggle = async (key: string, enabled: boolean) => {
    try {
      await invokeAdminAction({ type: "set_feature_flag", key, enabled });
      toast.success("Flag atualizada");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    }
  };

  if (loading) return <p className="px-4 py-6 text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4 px-4 py-6 max-w-4xl xl:max-w-6xl mx-auto">
      <h1 className="text-xl font-black uppercase tracking-wide">Feature flags</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma flag cadastrada.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/40 px-3 py-3"
            >
              <div>
                <div className="font-mono text-sm font-bold">{r.key}</div>
                <div className="text-[10px] text-muted-foreground">
                  rollout {r.rollout_percent}% · atualizado{" "}
                  {new Date(r.updated_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void toggle(r.key, !r.enabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase ${
                  r.enabled
                    ? "bg-[hsl(140_40%_25%)] text-[hsl(140_90%_65%)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {r.enabled ? "Ligado" : "Desligado"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
