import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildVisualResult, sampleMultiplier } from "../_shared/multiplierTable.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
};

const TARGET_MULT = 20;
const MAX_PAYOUT = 400;
const MIN_STAKE = 1;
const MAX_STAKE = 50;

interface StartBody {
  stake_amount?: unknown;
  mode?: unknown;
  idempotency_key?: unknown;
}

interface LayoutParams {
  targetBarrier: number;
  maxDurationSeconds: number;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cryptoRng(): () => number {
  const buf = new Uint32Array(1);
  return () => {
    crypto.getRandomValues(buf);
    return buf[0]! / 0xffffffff;
  };
}

function mapMultiplierToLayout(mult: number): LayoutParams {
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

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();

  if (authErr || !user) {
    return json(401, { error: "invalid_session" });
  }

  let body: StartBody;
  try {
    body = (await req.json()) as StartBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const stake = Number(body.stake_amount);
  const mode = typeof body.mode === "string" ? body.mode : "";
  const headerIdem = req.headers.get("idempotency-key");
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.length > 0
      ? body.idempotency_key
      : headerIdem && headerIdem.length > 0
        ? headerIdem
        : crypto.randomUUID();

  if (mode !== "target_20x") {
    return json(400, { error: "invalid_mode" });
  }

  if (!Number.isFinite(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
    return json(400, { error: "invalid_stake" });
  }

  const stakeRounded = Math.round(stake * 100) / 100;

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("over_18_confirmed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    console.error(profileErr);
    return json(500, { error: "profile_read_failed" });
  }

  if (!profile?.over_18_confirmed_at) {
    return json(403, { error: "age_required" });
  }

  const rng = cryptoRng();
  const resultMultiplier = sampleMultiplier(rng);
  let payout = Math.round(stakeRounded * resultMultiplier * 100) / 100;
  if (payout > MAX_PAYOUT) {
    payout = MAX_PAYOUT;
  }
  const netResult = Math.round((payout - stakeRounded) * 100) / 100;
  const visual = buildVisualResult(resultMultiplier);
  const layout = mapMultiplierToLayout(resultMultiplier);
  const layoutSeed = `${user.id}:${idempotencyKey}:${resultMultiplier.toFixed(4)}`;
  const layoutSignature = await sha256Hex(
    `${layoutSeed}|${layout.targetBarrier}|${layout.maxDurationSeconds}|${stakeRounded}`,
  );

  const { data: roundId, error: rpcErr } = await admin.rpc("start_round_atomic", {
    p_user_id: user.id,
    p_stake: stakeRounded,
    p_result_mult: resultMultiplier,
    p_payout: payout,
    p_net: netResult,
    p_visual: visual,
    p_layout_seed: layoutSeed,
    p_target_barrier: layout.targetBarrier,
    p_max_duration_seconds: layout.maxDurationSeconds,
    p_layout_signature: layoutSignature,
    p_idempotency_key: idempotencyKey,
  });

  if (rpcErr) {
    console.error("start_round_atomic:", rpcErr);
    const msg = rpcErr.message ?? "";
    if (msg.includes("insufficient_balance")) {
      return json(400, { error: "insufficient_balance" });
    }
    if (msg.includes("wallet_not_found")) {
      return json(400, { error: "wallet_not_found" });
    }
    return json(500, { error: "round_failed" });
  }

  const { data: row, error: fetchErr } = await admin
    .from("game_rounds")
    .select(
      "id,stake,mode,target_multiplier,result_multiplier,payout,net_result,visual_result,layout_seed,target_barrier,max_duration_seconds,layout_signature,round_status",
    )
    .eq("id", roundId as string)
    .single();

  if (fetchErr || !row) {
    console.error(fetchErr);
    return json(500, { error: "round_fetch_failed" });
  }

  return json(200, {
    ok: true,
    round_id: row.id,
    stake_amount: Number(row.stake),
    target_multiplier: TARGET_MULT,
    result_multiplier: Number(row.result_multiplier),
    payout_amount: Number(row.payout),
    net_result: Number(row.net_result),
    visual_result: row.visual_result,
    layout_seed: row.layout_seed,
    target_barrier: Number(row.target_barrier),
    max_duration_seconds: Number(row.max_duration_seconds),
    layout_signature: String(row.layout_signature),
    round_status: String(row.round_status),
    idempotency_key: idempotencyKey,
  });
});
