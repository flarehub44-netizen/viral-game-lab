import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

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

  const [
    profileRes,
    walletRes,
    roundsRes,
    ledgerRes,
    depositsRes,
    withdrawalsRes,
    consentsRes,
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    admin.from("wallets").select("balance, updated_at").eq("user_id", user.id).maybeSingle(),
    admin
      .from("game_rounds")
      .select("id, stake, payout, net_result, result_multiplier, round_status, created_at, ended_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("ledger_entries")
      .select("id, kind, amount, balance_after, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("pix_deposits")
      .select("id, amount, status, created_at, confirmed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("pix_withdrawals")
      .select("id, amount, pix_key_type, status, created_at, processed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("user_consents")
      .select("document_type, document_version, accepted_at")
      .eq("user_id", user.id)
      .order("accepted_at", { ascending: false }),
  ]);

  await admin.rpc("log_data_access_event", {
    p_actor_user_id: user.id,
    p_target_user_id: user.id,
    p_action: "lgpd_export",
    p_context: { source: "edge_function" },
  });

  return json(200, {
    ok: true,
    exported_at: new Date().toISOString(),
    user_id: user.id,
    email: user.email,
    data: {
      profile:        profileRes.data,
      wallet:         walletRes.data,
      rounds:         roundsRes.data         ?? [],
      ledger_entries: ledgerRes.data         ?? [],
      pix_deposits:   depositsRes.data       ?? [],
      pix_withdrawals: withdrawalsRes.data   ?? [],
      consents:       consentsRes.data       ?? [],
    },
  });
});
