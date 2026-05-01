import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";

export type PixDepositStatus = "pending" | "confirmed" | "failed" | "expired";

export function usePixDepositPolling(depositId: string | null, intervalMs = 3000) {
  const [status, setStatus] = useState<PixDepositStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const stopped = useRef(false);
  const startedAtRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);
  const tickCountRef = useRef(0);

  useEffect(() => {
    stopped.current = false;
    startedAtRef.current = Date.now();
    consecutiveErrorsRef.current = 0;
    tickCountRef.current = 0;
    setPollError(null);
    if (!depositId) {
      setStatus(null);
      setPollError(null);
      return;
    }

    const tick = async () => {
      if (stopped.current) return;
      tickCountRef.current += 1;

      const { data, error } = await supabase
        .from("pix_deposits")
        .select("status")
        .eq("id", depositId)
        .maybeSingle();

      if (error || !data?.status) {
        consecutiveErrorsRef.current += 1;
        const elapsedMs = Date.now() - startedAtRef.current;
        if (consecutiveErrorsRef.current >= 5 || elapsedMs > 90_000) {
          stopped.current = true;
          setPollError("poll_unavailable");
          setStatus("failed");
        }
        return;
      }
      consecutiveErrorsRef.current = 0;
      const s = data.status as PixDepositStatus;
      setStatus(s);
      if (s === "confirmed" || s === "failed" || s === "expired") {
        stopped.current = true;
        return;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      stopped.current = true;
      window.clearInterval(id);
    };
  }, [depositId, intervalMs]);

  return { status, pollError };
}
