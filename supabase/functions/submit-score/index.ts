import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ROUND_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas

interface SubmitBody {
  nickname?: unknown;
  score?: unknown;
  duration_seconds?: unknown;
  round_id?: unknown;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first || null;
}

function sanitizeNickname(raw: string): string {
  const trimmed = raw.trim().slice(0, 20);
  // eslint-disable-next-line no-control-regex -- intentional: strip ASCII control chars from display names
  return trimmed.replace(/[\u0000-\u001f\u007f]/g, "");
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
  const admin = createClient(supabaseUrl, serviceKey);

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "invalid_session" });

  const { data: allowRate, error: rateErr } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "submit-score",
    p_ip: extractClientIp(req),
    p_device_fingerprint: req.headers.get("x-device-fingerprint"),
    p_limit: 8,
    p_window_seconds: 60,
  });
  if (rateErr) {
    console.error("guard_request_rate:", rateErr);
    return json(500, { error: "rate_limit_check_failed" });
  }
  if (!allowRate) return json(429, { error: "rate_limited" });

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const nicknameRaw = typeof body.nickname === "string" ? body.nickname : "";
  const score = Number(body.score);
  const duration = Number(body.duration_seconds);
  const roundIdRaw = typeof body.round_id === "string" ? body.round_id.trim() : "";

  const nickname = sanitizeNickname(nicknameRaw);

  if (
    !nickname ||
    nickname.length < 1 ||
    nickname.length > 20 ||
    !Number.isFinite(score) ||
    !Number.isFinite(duration) ||
    score < 1 ||
    score > 10_000_000 ||
    duration < 1 ||
    duration > 3600
  ) {
    return json(400, { error: "invalid_payload" });
  }

  // Plausibility: score = aliveBalls per barrier, max ~32 balls,
  // ~1 barrier/sec → ~32 pts/sec ceiling, plus generous slack.
  const maxPlausible = duration * 200 + 100;
  if (score > maxPlausible) {
    return json(400, { error: "implausible_score" });
  }

  // Valida round_id: deve pertencer ao usuário e estar encerrado.
  // Impede fabricação de scores sem ter jogado uma rodada real.
  if (roundIdRaw) {
    const { data: round, error: roundErr } = await admin
      .from("game_rounds")
      .select("id, user_id, round_status, created_at")
      .eq("id", roundIdRaw)
      .maybeSingle();

    if (roundErr || !round) {
      return json(400, { error: "round_not_found" });
    }
    if (round.user_id !== user.id) {
      return json(403, { error: "round_not_owned" });
    }
    if (round.round_status !== "closed" && round.round_status !== "expired") {
      return json(400, { error: "round_not_settled" });
    }
    const roundAge = Date.now() - new Date(String(round.created_at)).getTime();
    if (roundAge > ROUND_MAX_AGE_MS) {
      return json(400, { error: "round_too_old" });
    }
  }

  const { data, error } = await admin
    .from("scores")
    .insert({
      nickname,
      score: Math.floor(score),
      max_multiplier: 1, // coluna legada — mantida para compatibilidade
      duration_seconds: Math.floor(duration),
      user_id: user.id,
      round_id: roundIdRaw || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Insert error:", error);
    // Unique violation: round_id já tem um score (tentativa de duplicar)
    if (error.code === "23505") {
      return json(409, { error: "score_already_submitted_for_round" });
    }
    return json(500, { error: "could_not_save_score" });
  }

  return json(200, { ok: true, id: data.id });
});
