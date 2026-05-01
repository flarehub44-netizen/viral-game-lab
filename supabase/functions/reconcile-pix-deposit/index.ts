import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { syncPayGetCashIn } from "../_shared/syncpay.ts";

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

function classifyStatus(raw: string): "paid" | "failed" | "pending" {
  const s = raw.trim().toUpperCase();
  if (s === "PAID_OUT" || s === "PAID" || s === "COMPLETED" || s === "APPROVED") return "paid";
  if (s === "FAILED" || s === "REFUNDED" || s === "REVERSED" || s === "EXPIRED" || s === "CANCELLED" || s === "CANCELED") return "failed";
  return "pending";
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

  const {
    data: { user },
    error: authErr,
  } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "invalid_session" });

  let body: { deposit_id?: unknown };
  try {
    body = (await req.json()) as { deposit_id?: unknown };
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const depositId = typeof body.deposit_id === "string" ? body.deposit_id : "";
  if (!depositId) return json(400, { error: "missing_deposit_id" });

  const { data: dep, error: depErr } = await admin
    .from("pix_deposits")
    .select("id, user_id, provider_ref, amount, status, created_at")
    .eq("id", depositId)
    .maybeSingle();

  if (depErr || !dep) return json(404, { error: "deposit_not_found" });
  if (dep.user_id !== user.id) return json(403, { error: "forbidden" });

  if (dep.status !== "pending") {
    return json(200, { ok: true, status: dep.status, action: "noop" });
  }
  if (!dep.provider_ref) {
    return json(200, { ok: true, status: dep.status, action: "no_provider_ref" });
  }

  const ageMs = Date.now() - new Date(dep.created_at).getTime();
  if (ageMs < 8000) {
    return json(200, { ok: true, status: dep.status, action: "too_soon" });
  }

  let providerStatus: string;
  let providerAmount: number | undefined;
  try {
    const remote = await syncPayGetCashIn(dep.provider_ref);
    providerStatus = String(remote.status ?? "");
    providerAmount = typeof remote.amount === "number" ? remote.amount : undefined;
  } catch (e) {
    console.error("syncPayGetCashIn:", e);
    return json(502, { error: "syncpay_status_failed" });
  }

  const outcome = classifyStatus(providerStatus);
  if (outcome === "pending") {
    return json(200, { ok: true, status: "pending", provider_status: providerStatus });
  }

  if (outcome === "failed") {
    await admin.rpc("cancel_pix_deposit_pending", { p_deposit_id: dep.id });
    return json(200, { ok: true, status: "failed", provider_status: providerStatus });
  }

  const amount =
    providerAmount && Number.isFinite(providerAmount)
      ? Math.round(providerAmount * 100) / 100
      : Number(dep.amount);

  const { data: confirmedId, error: confirmErr } = await admin.rpc("confirm_pix_deposit", {
    p_provider_ref: dep.provider_ref,
    p_amount: amount,
    p_webhook_payload: { source: "reconcile", provider_status: providerStatus },
  });
  if (confirmErr) {
    console.error("confirm_pix_deposit:", confirmErr);
    return json(500, { error: "confirm_failed", detail: confirmErr.message });
  }
  return json(200, { ok: true, status: "confirmed", deposit_id: confirmedId });
});
