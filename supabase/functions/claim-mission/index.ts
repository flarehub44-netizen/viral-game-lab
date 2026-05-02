import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-fingerprint",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || null;
}

// Recompensa fixa por missão diária. Curto orçamento (até R$0,30/dia se completar todas).
const MISSION_REWARD = 0.10;

// Allowlist de mission_ids — espelha src/game/progression.ts MISSION_POOL.
const ALLOWED_MISSION_IDS = new Set([
  "score_50", "score_75", "score_150", "score_250",
  "combo_5", "combo_8", "combo_15", "combo_20",
  "alive_8", "alive_15", "alive_30", "alive_50",
  "survive_30", "survive_45", "survive_90",
  "splits_20", "splits_40",
  "powerups_3",
]);

interface Body {
  mission_id?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "invalid_session" });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const missionId = typeof body.mission_id === "string" ? body.mission_id : "";
  if (!ALLOWED_MISSION_IDS.has(missionId)) {
    return json(400, { error: "invalid_mission_id" });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: allow } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "claim-mission",
    p_ip: extractClientIp(req),
    p_device_fingerprint: req.headers.get("x-device-fingerprint"),
    p_limit: 10,
    p_window_seconds: 60,
  });
  if (!allow) return json(429, { error: "rate_limited" });

  const { data: profile } = await admin.from("profiles")
    .select("over_18_confirmed_at, deleted_at").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.deleted_at) return json(403, { error: "profile_invalid" });
  if (!profile.over_18_confirmed_at) return json(403, { error: "age_required" });

  // Anti-fraude leve: só credita se o usuário tem ao menos uma rodada real fechada hoje
  // com score>=goal. Como o "score" mora no client, validação simplificada é exigir
  // pelo menos 1 rodada real do dia (não-sandbox, fechada).
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count: roundsToday } = await admin
    .from("game_rounds")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .neq("mode", "sandbox")
    .gte("created_at", since.toISOString())
    .in("round_status", ["closed", "expired"]);
  if ((roundsToday ?? 0) < 1) {
    return json(400, { error: "no_qualifying_rounds_today" });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  const { data, error } = await admin.rpc("claim_mission_atomic", {
    p_user_id: user.id,
    p_mission_id: missionId,
    p_mission_seed: today,
    p_amount: MISSION_REWARD,
  });
  if (error) {
    console.error("claim_mission_atomic:", error);
    if (error.message?.includes("already_claimed")) {
      return json(409, { error: "already_claimed" });
    }
    return json(500, { error: "claim_failed" });
  }

  return json(200, {
    ok: true,
    mission_id: missionId,
    bonus_amount: MISSION_REWARD,
    claim_id: data,
  });
});
