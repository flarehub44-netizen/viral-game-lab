import { supabase } from "@/lib/supabaseExternal";

export type AdminRequestBody =
  | { type: "search_users"; query?: string; limit?: number }
  | { type: "credit"; user_id: string; amount: number; note?: string }
  | { type: "debit"; user_id: string; amount: number; note?: string }
  | { type: "approve_kyc"; user_id: string }
  | { type: "set_age_confirmed"; user_id: string; confirmed: boolean }
  | { type: "ban_user"; user_id: string }
  | { type: "unban_user"; user_id: string }
  | { type: "set_feature_flag"; key: string; enabled: boolean; rollout_percent?: number | null }
  | { type: "sandbox_round"; stake: number; force_multiplier?: number; force_target_barrier?: number }
  | { type: "reset_sandbox" };

export type AdminSearchRow = {
  user_id: string;
  email: string;
  display_name: string;
  kyc_status: string;
  is_admin: boolean;
  deleted_at: string | null;
  balance: number;
};

function messageFromInvokeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const ctx = (error as { context?: { body?: { error?: string; detail?: string } } })?.context?.body;
  if (ctx?.detail) return String(ctx.detail);
  if (ctx?.error) return String(ctx.error);
  return "Falha na função admin-action";
}

export async function invokeAdminAction<T>(body: AdminRequestBody): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-action", { body });
  if (error) throw new Error(messageFromInvokeError(error));
  const payload = data as { ok?: boolean; error?: string; detail?: string } | null;
  if (payload && payload.ok === false) {
    throw new Error(payload.detail || payload.error || "admin_action_failed");
  }
  return data as T;
}
