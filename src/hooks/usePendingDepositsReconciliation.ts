import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseExternal";

/**
 * Quando o usuário abre a carteira, dispara reconciliação SyncPay para
 * todos os PIX `pending` com `provider_ref` ainda válidos. Isso garante
 * crédito mesmo que o webhook tenha falhado.
 *
 * @param userId  usuário logado (null = não roda)
 * @param onDone  callback chamado após a varredura terminar (para refetch)
 */
export function usePendingDepositsReconciliation(
  userId: string | null,
  onDone?: () => void,
) {
  const ranRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (ranRef.current === userId) return;
    ranRef.current = userId;

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("pix_deposits")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "pending")
        .not("provider_ref", "is", null)
        .gte("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
        .limit(20);

      if (cancelled || error || !data || data.length === 0) {
        if (!cancelled && data && data.length === 0) onDone?.();
        return;
      }

      await Promise.allSettled(
        data.map((d) =>
          supabase.functions.invoke("reconcile-pix-deposit", {
            body: { deposit_id: d.id },
          }),
        ),
      );

      if (!cancelled) onDone?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, onDone]);
}
