import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildVisualResult, MULTIPLIER_TIERS } from "../_shared/multiplierTable.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_PAYOUT = 400;
const TARGET_MULT = 20;
const MIN_STAKE = 1;
const MAX_STAKE = 50;

const ALLOWED_MULTS = new Set(MULTIPLIER_TIERS.map((t) => t.multiplier));

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapMultiplierToLayout(mult: number): { targetBarrier: number; maxDurationSeconds: number } {
  if (mult <= 0) return { targetBarrier: 4, maxDurationSeconds: 10 };
  if (mult <= 0.2) return { targetBarrier: 6, maxDurationSeconds: 14 };
  if (mult <= 0.5) return { targetBarrier: 9, maxDurationSeconds: 18 };
  if (mult <= 0.8) return { targetBarrier: 12, maxDurationSeconds: 24 };
  if (mult <= 1) return { targetBarrier: 14, maxDurationSeconds: 28 };
  if (mult <= 1.5) return { targetBarrier: 18, maxDurationSeconds: 34 };
  if (mult <= 2) return { targetBarrier: 21, maxDurationSeconds: 40 };
  if (mult <= 3) return { targetBarrier: 25, maxDurationSeconds: 46 };
  if (mult <= 5) return { targetBarrier: 30, maxDurationSeconds: 54 };
  if (mult <= 10) return { targetBarrier: 36, maxDurationSeconds: 62 };
  return { targetBarrier: 42, maxDurationSeconds: 72 };
}

function hexFromBytes(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return hexFromBytes(sig);
}

async function signLayout(secret: string, message: string): Promise<string> {
  if (!secret) throw new Error("missing_layout_secret");
  return hmacSha256Hex(secret, message);
}

type AdminBody =
  | { type: "search_users"; query?: string; limit?: number }
  | { type: "credit"; user_id: string; amount: number; note?: string }
  | { type: "debit"; user_id: string; amount: number; note?: string }
  | { type: "approve_kyc"; user_id: string }
  | { type: "set_age_confirmed"; user_id: string; confirmed: boolean }
  | { type: "ban_user"; user_id: string }
  | { type: "unban_user"; user_id: string }
  | { type: "set_feature_flag"; key: string; enabled: boolean; rollout_percent?: number | null }
  | { type: "sandbox_round"; stake: number; forced_multiplier: number }
  | { type: "reset_sandbox" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const layoutSecret = Deno.env.get("LAYOUT_SIGNATURE_SECRET") ?? "";

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "invalid_session" });

  const { data: prof, error: profErr } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr || !prof?.is_admin) {
    return json(403, { error: "forbidden" });
  }

  let body: AdminBody;
  try {
    body = (await req.json()) as AdminBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const log = async (action: string, target: string | null, payload: Record<string, unknown>) => {
    const { error } = await admin.rpc("admin_log_action", {
      p_admin_id: user.id,
      p_action: action,
      p_target: target,
      p_payload: payload,
    });
    if (error) console.error("admin_log_action:", error);
  };

  try {
    switch (body.type) {
      case "search_users": {
        const { data, error } = await admin.rpc("admin_search_users", {
          p_actor: user.id,
          p_query: body.query ?? "",
          p_limit: body.limit ?? 25,
        });
        if (error) throw error;
        await log("search_users", null, { query: body.query });
        return json(200, { ok: true, rows: data ?? [] });
      }
      case "credit": {
        const { data, error } = await admin.rpc("admin_credit_wallet", {
          p_actor: user.id,
          p_target: body.user_id,
          p_amount: body.amount,
          p_note: body.note ?? null,
        });
        if (error) throw error;
        await log("credit", body.user_id, { amount: body.amount });
        return json(200, { ok: true, new_balance: data });
      }
      case "debit": {
        const { data, error } = await admin.rpc("admin_debit_wallet", {
          p_actor: user.id,
          p_target: body.user_id,
          p_amount: body.amount,
          p_note: body.note ?? null,
        });
        if (error) throw error;
        await log("debit", body.user_id, { amount: body.amount });
        return json(200, { ok: true, new_balance: data });
      }
      case "approve_kyc": {
        const { error } = await admin.rpc("admin_set_kyc", {
          p_actor: user.id,
          p_target: body.user_id,
          p_status: "approved",
        });
        if (error) throw error;
        await log("approve_kyc", body.user_id, {});
        return json(200, { ok: true });
      }
      case "set_age_confirmed": {
        const { error } = await admin.rpc("admin_set_age_confirmed", {
          p_actor: user.id,
          p_target: body.user_id,
          p_confirmed: body.confirmed,
        });
        if (error) throw error;
        await log("set_age_confirmed", body.user_id, { confirmed: body.confirmed });
        return json(200, { ok: true });
      }
      case "ban_user": {
        const { error } = await admin.rpc("admin_ban_user", {
          p_actor: user.id,
          p_target: body.user_id,
        });
        if (error) throw error;
        await log("ban_user", body.user_id, {});
        return json(200, { ok: true });
      }
      case "unban_user": {
        const { error } = await admin.rpc("admin_unban_user", {
          p_actor: user.id,
          p_target: body.user_id,
        });
        if (error) throw error;
        await log("unban_user", body.user_id, {});
        return json(200, { ok: true });
      }
      case "set_feature_flag": {
        const { error } = await admin.rpc("admin_set_feature_flag", {
          p_actor: user.id,
          p_key: body.key,
          p_enabled: body.enabled,
          p_rollout: body.rollout_percent ?? null,
        });
        if (error) throw error;
        await log("set_feature_flag", null, { key: body.key, enabled: body.enabled });
        return json(200, { ok: true });
      }
      case "reset_sandbox": {
        const { data, error } = await admin.rpc("admin_delete_sandbox_rounds", {
          p_actor: user.id,
        });
        if (error) throw error;
        await log("reset_sandbox", user.id, { deleted: data });
        return json(200, { ok: true, deleted: data });
      }
      case "sandbox_round": {
        const stake = Math.round(Number(body.stake) * 100) / 100;
        const mult = Number(body.forced_multiplier);
        if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
          return json(400, { error: "invalid_stake" });
        }
        if (!Number.isFinite(mult) || !ALLOWED_MULTS.has(mult)) {
          return json(400, { error: "invalid_multiplier" });
        }
        let payout = Math.round(stake * mult * 100) / 100;
        if (payout > MAX_PAYOUT) payout = MAX_PAYOUT;
        const netResult = Math.round((payout - stake) * 100) / 100;
        const visual = buildVisualResult(mult);
        const layout = mapMultiplierToLayout(mult);
        const idem = `sandbox:${user.id}:${crypto.randomUUID()}`;
        const layoutSeed = `${user.id}:${idem}:${mult.toFixed(4)}`;
        const signatureInput = `${layoutSeed}|${layout.targetBarrier}|${layout.maxDurationSeconds}|${stake}`;
        const layoutSignature = await signLayout(layoutSecret, signatureInput);

        const { data: roundId, error: rpcErr } = await admin.rpc("admin_sandbox_round", {
          p_admin_id: user.id,
          p_stake: stake,
          p_result_mult: mult,
          p_payout: payout,
          p_net: netResult,
          p_visual: visual,
          p_layout_seed: layoutSeed,
          p_target_barrier: layout.targetBarrier,
          p_max_duration_seconds: layout.maxDurationSeconds,
          p_layout_signature: layoutSignature,
          p_idempotency_key: idem,
        });
        if (rpcErr) throw rpcErr;

        await log("sandbox_round", user.id, { round_id: roundId, mult, stake });

        const round = {
          ok: true,
          round_id: roundId as string,
          stake_amount: stake,
          target_multiplier: TARGET_MULT,
          result_multiplier: mult,
          payout_amount: payout,
          net_result: netResult,
          visual_result: visual,
          layout_seed: layoutSeed,
          target_barrier: layout.targetBarrier,
          max_duration_seconds: layout.maxDurationSeconds,
          layout_signature: layoutSignature,
          round_status: "closed",
          idempotency_key: idem,
        };
        return json(200, { ok: true, round });
      }
      default:
        return json(400, { error: "unknown_action" });
    }
  } catch (e) {
    console.error("admin-action:", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not_admin")) return json(403, { error: "forbidden" });
    if (msg.includes("cannot_ban")) return json(400, { error: msg });
    if (msg.includes("insufficient_balance")) return json(400, { error: "insufficient_balance" });
    return json(500, { error: "admin_action_failed", detail: msg });
  }
});
