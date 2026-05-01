import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isValidSyncPayWebhookAuthorization } from "../_shared/syncpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-pix-signature",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.split(",")[0]?.trim() ?? null;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;

  return null;
}

function parseIpAllowlist(): string[] {
  const allowlistRaw = Deno.env.get("SYNC_PAY_WEBHOOK_IP_ALLOWLIST") ?? "";
  return allowlistRaw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Quando a allowlist está vazia, não exige IP (usa só bearer ou outro controle). */
function isIpAllowed(clientIp: string | null, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!clientIp) return false;
  return allowlist.includes(clientIp);
}

function isAllowedEvent(eventType: string): boolean {
  return (
    eventType === "cashin.create" ||
    eventType === "cashin.update" ||
    eventType === "cashout.create" ||
    eventType === "cashout.update"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const clientIp = extractClientIp(req);
  const ipAllowlist = parseIpAllowlist();
  const bearerConfigured = Boolean(Deno.env.get("SYNC_PAY_WEBHOOK_BEARER_TOKEN"));
  const webhookSecurityConfigured = ipAllowlist.length > 0 || bearerConfigured;

  if (!webhookSecurityConfigured) {
    return json(503, {
      error: "webhook_security_not_configured",
      hint:
        "Configure SYNC_PAY_WEBHOOK_IP_ALLOWLIST and/or SYNC_PAY_WEBHOOK_BEARER_TOKEN before accepting live Pix webhooks.",
    });
  }

  if (!isIpAllowed(clientIp, ipAllowlist)) {
    return json(401, { error: "ip_not_allowed" });
  }

  if (bearerConfigured && !isValidSyncPayWebhookAuthorization(req.headers.get("Authorization"))) {
    return json(401, { error: "invalid_signature" });
  }

  const eventType = req.headers.get("event") ?? "";
  if (!isAllowedEvent(eventType)) {
    return json(400, { error: "unsupported_event" });
  }
  const rawPayload = await req.text();
  let body: { provider_ref?: unknown; amount?: unknown; status?: unknown };
  try {
    body = JSON.parse(rawPayload) as { provider_ref?: unknown; amount?: unknown; status?: unknown };
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const dataObj = (body as { data?: Record<string, unknown> }).data ?? {};
  const providerRef = String(dataObj.id ?? body.provider_ref ?? "");
  const amount = Math.round(Number(dataObj.amount ?? body.amount) * 100) / 100;
  const status = String(dataObj.status ?? body.status ?? "");
  if (!providerRef || !Number.isFinite(amount) || !status) {
    return json(400, { error: "invalid_payload" });
  }

  // Previne replay de webhooks antigos. Verifica apenas se o payload incluir timestamp.
  const MAX_WEBHOOK_AGE_MS = 5 * 60 * 1000;
  const eventTimestampRaw = dataObj.created_at ?? dataObj.timestamp ?? dataObj.event_time;
  if (eventTimestampRaw) {
    const eventTs = new Date(String(eventTimestampRaw)).getTime();
    if (Number.isFinite(eventTs) && Date.now() - eventTs > MAX_WEBHOOK_AGE_MS) {
      console.warn("Webhook event too old:", {
        providerRef,
        ageSec: Math.round((Date.now() - eventTs) / 1000),
      });
      return json(400, { error: "event_too_old" });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: firstSeen, error: registerErr } = await admin.rpc("register_webhook_event", {
    p_provider: "syncpay",
    p_provider_event_id: providerRef,
    p_event_type: eventType,
    p_status: status,
    p_payload: body,
    p_source_ip: clientIp,
  });
  if (registerErr) {
    console.error("register_webhook_event:", registerErr);
    return json(500, { error: "webhook_register_failed" });
  }
  if (!firstSeen) {
    return json(200, { ok: true, duplicated: true });
  }

  if (eventType.startsWith("cashin.")) {
    if (status !== "completed") return json(200, { ok: true, ignored: true });
    const { data, error } = await admin.rpc("confirm_pix_deposit", {
      p_provider_ref: providerRef,
      p_amount: amount,
      p_webhook_payload: body,
    });
    if (error) {
      await admin.rpc("log_fraud_signal", {
        p_user_id: null,
        p_round_id: null,
        p_signal: "syncpay_cashin_apply_failed",
        p_score: 12,
        p_payload: { providerRef, status, eventType, clientIp },
      });
      console.error("confirm_pix_deposit:", error);
      return json(500, { error: "confirm_failed" });
    }
    return json(200, { ok: true, deposit_id: data });
  }

  if (eventType.startsWith("cashout.")) {
    const { data, error } = await admin.rpc("apply_syncpay_cashout_webhook", {
      p_reference_id: providerRef,
      p_status: status,
      p_payload: body,
    });
    if (error) {
      await admin.rpc("log_fraud_signal", {
        p_user_id: null,
        p_round_id: null,
        p_signal: "syncpay_cashout_apply_failed",
        p_score: 12,
        p_payload: { providerRef, status, eventType, clientIp },
      });
      console.error("apply_syncpay_cashout_webhook:", error);
      return json(500, { error: "cashout_update_failed" });
    }
    return json(200, { ok: true, withdrawal_id: data, status });
  }

  return json(200, { ok: true, ignored: true, event: eventType });
});
