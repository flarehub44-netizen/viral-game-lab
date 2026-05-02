import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WalletBonusInfo = {
  balance: number;
  bonus_balance: number;
  bonus_rollover_required: number;
  bonus_rollover_progress: number;
  free_spins_remaining: number;
};

export function useWalletBonus(userId: string | null) {
  const [data, setData] = useState<WalletBonusInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setData(null);
      return;
    }
    setLoading(true);
    const { data: row, error } = await supabase
      .from("wallets")
      .select(
        "balance, bonus_balance, bonus_rollover_required, bonus_rollover_progress, free_spins_remaining",
      )
      .eq("user_id", userId)
      .maybeSingle();
    setLoading(false);
    if (error || !row) {
      setData(null);
      return;
    }
    setData({
      balance: Number(row.balance),
      bonus_balance: Number(row.bonus_balance ?? 0),
      bonus_rollover_required: Number(row.bonus_rollover_required ?? 0),
      bonus_rollover_progress: Number(row.bonus_rollover_progress ?? 0),
      free_spins_remaining: Number(row.free_spins_remaining ?? 0),
    });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, refresh };
}

export type WelcomeBonusState = "loading" | "available" | "claimed" | "ineligible";

export function useWelcomeBonusState(userId: string | null) {
  const [state, setState] = useState<WelcomeBonusState>("loading");

  const refresh = useCallback(async () => {
    if (!userId) {
      setState("ineligible");
      return;
    }
    const { data, error } = await supabase
      .from("welcome_bonus_claims")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      setState("ineligible");
      return;
    }
    setState(data ? "claimed" : "available");
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, refresh };
}

export type DailyLoginStatus = {
  canClaim: boolean;
  todayClaimed: boolean;
  currentStreak: number;
  lastLoginDate: string | null;
};

export function useDailyLoginStatus(userId: string | null) {
  const [status, setStatus] = useState<DailyLoginStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setStatus(null);
      return;
    }
    const { data } = await supabase
      .from("daily_logins")
      .select("login_date, streak_day")
      .eq("user_id", userId)
      .order("login_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const last = data?.login_date ?? null;
    const todayClaimed = last === today;
    const lastStreak = data?.streak_day ?? 0;
    setStatus({
      canClaim: !todayClaimed,
      todayClaimed,
      currentStreak: todayClaimed ? lastStreak : 0,
      lastLoginDate: last,
    });
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, refresh };
}
