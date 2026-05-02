import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-fingerprint",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || null;
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

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: allow } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "claim-daily-login",
    p_ip: extractClientIp(req),
    p_device_fingerprint: req.headers.get("x-device-fingerprint"),
    p_limit: 5, p_window_seconds: 60,
  });
  if (!allow) return json(429, { error: "rate_limited" });

  const { data: profile } = await admin.from("profiles")
    .select("over_18_confirmed_at, deleted_at").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.deleted_at) return json(403, { error: "profile_invalid" });
  if (!profile.over_18_confirmed_at) return json(403, { error: "age_required" });

  const { data, error } = await admin.rpc("claim_daily_login", { p_user_id: user.id });
  if (error) {
    console.error("claim_daily_login:", error);
    if (error.message?.includes("already_claimed_today")) {
      return json(409, { error: "already_claimed_today" });
    }
    return json(500, { error: "claim_failed" });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return json(200, {
    ok: true,
    streak_day: row?.streak_day,
    bonus_amount: Number(row?.bonus_amount ?? 0),
  });
});
