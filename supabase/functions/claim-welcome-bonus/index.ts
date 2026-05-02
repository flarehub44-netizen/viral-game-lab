import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-fingerprint",
};

const WELCOME_AMOUNT = 1.0;
const WELCOME_ROLLOVER = 10;
const FREE_SPINS = 3;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  const ip = extractClientIp(req);
  const deviceFp = req.headers.get("x-device-fingerprint");

  // Rate limit
  const { data: allow } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "claim-welcome-bonus",
    p_ip: ip,
    p_device_fingerprint: deviceFp,
    p_limit: 5,
    p_window_seconds: 60,
  });
  if (!allow) return json(429, { error: "rate_limited" });

  // Age gate
  const { data: profile } = await admin.from("profiles")
    .select("over_18_confirmed_at, deleted_at").eq("user_id", user.id).maybeSingle();
  if (!profile || profile.deleted_at) return json(403, { error: "profile_invalid" });
  if (!profile.over_18_confirmed_at) return json(403, { error: "age_required" });

  // Já reclamou?
  const { data: existing } = await admin.from("welcome_bonus_claims")
    .select("user_id").eq("user_id", user.id).maybeSingle();
  if (existing) return json(409, { error: "already_claimed" });

  // Anti-fraude device/IP
  const ipHash = ip ? await sha256Hex(ip) : null;
  if (deviceFp) {
    const { data: dup } = await admin.from("welcome_bonus_claims")
      .select("user_id").eq("device_fingerprint", deviceFp).maybeSingle();
    if (dup) return json(409, { error: "device_already_claimed" });
  }

  // Insere claim (UNIQUE em user_id e device_fingerprint protege contra race)
  const { error: claimErr } = await admin.from("welcome_bonus_claims").insert({
    user_id: user.id,
    device_fingerprint: deviceFp,
    ip_hash: ipHash,
  });
  if (claimErr) {
    console.error("welcome_bonus_claims insert:", claimErr);
    if (claimErr.code === "23505") return json(409, { error: "already_claimed" });
    return json(500, { error: "claim_insert_failed" });
  }

  // Concede o bônus
  const { error: grantErr } = await admin.rpc("grant_bonus_atomic", {
    p_user_id: user.id,
    p_amount: WELCOME_AMOUNT,
    p_rollover_multiplier: WELCOME_ROLLOVER,
    p_kind: "welcome",
    p_meta: { source: "welcome_bonus" },
  });
  if (grantErr) {
    console.error("grant_bonus_atomic:", grantErr);
    return json(500, { error: "grant_failed" });
  }

  // Free spins
  const { error: spinErr } = await admin.from("wallets")
    .update({ free_spins_remaining: FREE_SPINS, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (spinErr) console.error("free_spins update:", spinErr);

  return json(200, {
    ok: true,
    bonus_amount: WELCOME_AMOUNT,
    rollover_multiplier: WELCOME_ROLLOVER,
    free_spins: FREE_SPINS,
  });
});
