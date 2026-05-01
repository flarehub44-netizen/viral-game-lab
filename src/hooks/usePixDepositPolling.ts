import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";

export type PixDepositStatus = "pending" | "confirmed" | "failed" | "expired";

export function usePixDepositPolling(depositId: string | null, intervalMs = 3000) {
  const [status, setStatus] = useState<PixDepositStatus | null>(null);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    if (!depositId) {
      setStatus(null);
      return;
    }

    const tick = async () => {
      if (stopped.current) return;
      const { data, error } = await supabase
        .from("pix_deposits")
        .select("status")
        .eq("id", depositId)
        .maybeSingle();
      if (error || !data?.status) return;
      const s = data.status as PixDepositStatus;
      setStatus(s);
      if (s === "confirmed" || s === "failed" || s === "expired") {
        stopped.current = true;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      stopped.current = true;
      window.clearInterval(id);
    };
  }, [depositId, intervalMs]);

  return status;
}
