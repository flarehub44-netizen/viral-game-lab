import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key",
};

interface EndBody {
  round_id?: unknown;
  alive?: unknown;
  layout_seed?: unknown;
  layout_signature?: unknown;
  barriers_passed?: unknown;
}

type RoundStatus = "open" | "closed" | "expired" | "rejected";

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);
  const deviceFingerprint = req.headers.get("x-device-fingerprint");
  const clientIp = extractClientIp(req);

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "invalid_session" });

  const { data: allowRate, error: rateErr } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "end-round",
    p_ip: clientIp,
    p_device_fingerprint: deviceFingerprint,
    p_limit: 24,
    p_window_seconds: 60,
  });
  if (rateErr) {
    console.error("guard_request_rate:", rateErr);
    return json(500, { error: "rate_limit_check_failed" });
  }
  if (!allowRate) {
    return json(429, { error: "rate_limited" });
  }

  let body: EndBody;
  try {
    body = (await req.json()) as EndBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const roundId = typeof body.round_id === "string" ? body.round_id : "";
  if (!roundId) return json(400, { error: "invalid_round" });

  const { data: row, error: rowErr } = await admin
    .from("game_rounds")
    .select(
      "id,user_id,created_at,layout_seed,layout_signature,max_duration_seconds,round_status,result_multiplier,payout,net_result",
    )
    .eq("id", roundId)
    .maybeSingle();

  if (rowErr || !row) return json(404, { error: "round_not_found" });
  if (row.user_id !== user.id) return json(403, { error: "forbidden" });
  if (row.round_status !== "open") {
    const settledStatus = String(row.round_status) as RoundStatus;
    await admin.rpc("log_fraud_signal", {
      p_user_id: user.id,
      p_round_id: row.id,
      p_signal: "end_round_replay_attempt",
      p_score: 4,
      p_payload: { round_status: settledStatus },
    });
    return json(200, {
      ok: true,
      round_id: row.id,
      round_status: settledStatus,
      result_multiplier: Number(row.result_multiplier),
      payout_amount: Number(row.payout),
      net_result: Number(row.net_result),
      forced_by_timeout: settledStatus === "expired",
      already_settled: true,
    });
  }

  const createdAt = new Date(String(row.created_at)).getTime();
  const elapsedSec = Number.isFinite(createdAt) ? (Date.now() - createdAt) / 1000 : 0;
  const hardTimeout = Number(row.max_duration_seconds) + 30;
  const timedOut = elapsedSec > hardTimeout;

  const alive = Number(body.alive);
  const hasAlive = Number.isFinite(alive);
  if (!timedOut && (!hasAlive || alive > 0)) return json(400, { error: "alive_must_be_zero_or_timeout" });

  if (typeof body.layout_seed !== "string" || body.layout_seed !== row.layout_seed) {
    await admin.rpc("log_fraud_signal", {
      p_user_id: user.id,
      p_round_id: row.id,
      p_signal: "layout_seed_mismatch",
      p_score: 15,
      p_payload: { payload: body },
    });
    await admin
      .from("game_rounds")
      .update({
        round_status: "rejected",
        ended_at: new Date().toISOString(),
        client_report: { reason: "layout_seed_mismatch", payload: body },
      })
      .eq("id", roundId)
      .eq("round_status", "open");
    return json(400, { error: "layout_mismatch_seed" });
  }

  if (
    typeof body.layout_signature !== "string" ||
    body.layout_signature !== row.layout_signature
  ) {
    await admin.rpc("log_fraud_signal", {
      p_user_id: user.id,
      p_round_id: row.id,
      p_signal: "layout_signature_mismatch",
      p_score: 25,
      p_payload: { payload: body },
    });
    await admin
      .from("game_rounds")
      .update({
        round_status: "rejected",
        ended_at: new Date().toISOString(),
        client_report: { reason: "layout_signature_mismatch", payload: body },
      })
      .eq("id", roundId)
      .eq("round_status", "open");
    return json(400, { error: "layout_mismatch_signature" });
  }

  const targetStatus: RoundStatus = timedOut ? "expired" : "closed";
  const { data: updated, error: updErr } = await admin
    .from("game_rounds")
    .update({
      round_status: targetStatus,
      ended_at: new Date().toISOString(),
      client_report: {
        alive: hasAlive ? alive : null,
        barriers_passed: Number(body.barriers_passed ?? 0),
        hard_timeout_seconds: hardTimeout,
        elapsed_seconds: elapsedSec,
      },
    })
    .eq("id", roundId)
    .eq("round_status", "open")
    .select("id,round_status,result_multiplier,payout,net_result")
    .maybeSingle();

  if (updErr || !updated) return json(409, { error: "round_update_conflict" });

  return json(200, {
    ok: true,
    round_id: updated.id,
    round_status: updated.round_status,
    result_multiplier: Number(updated.result_multiplier),
    payout_amount: Number(updated.payout),
    net_result: Number(updated.net_result),
    forced_by_timeout: timedOut,
  });
});
