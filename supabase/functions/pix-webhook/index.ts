import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isValidSyncPayWebhookAuthorization } from "../_shared/syncpay.ts";

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

function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.split(",")[0]?.trim() ?? null;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() ?? null;
  return null;
}

type Outcome = "paid" | "failed" | "ignored";

function classifyStatus(raw: string): Outcome {
  const s = raw.trim().toUpperCase();
  // SyncPay status values per docs: pending, completed, failed, refunded, med
  // (legacy: PAID_OUT, PAID, APPROVED)
  if (s === "COMPLETED" || s === "PAID_OUT" || s === "PAID" || s === "APPROVED") return "paid";
  if (
    s === "FAILED" ||
    s === "REFUNDED" ||
    s === "REVERSED" ||
    s === "EXPIRED" ||
    s === "CANCELLED" ||
    s === "CANCELED" ||
    s === "MED"
  ) {
    return "failed";
  }
  return "ignored";
}

function pickFirst<T>(...values: Array<T | undefined | null>): T | undefined {
  for (const v of values) if (v !== undefined && v !== null && v !== "") return v as T;
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Bearer opcional. Se SYNC_PAY_WEBHOOK_BEARER_TOKEN estiver setado, exige header
  // Authorization correspondente. Caso contrário, aceita (a URL é o segredo).
  const bearerConfigured = Boolean(Deno.env.get("SYNC_PAY_WEBHOOK_BEARER_TOKEN"));
  if (bearerConfigured && !isValidSyncPayWebhookAuthorization(req.headers.get("Authorization"))) {
    return json(401, { error: "invalid_bearer" });
  }

  const clientIp = extractClientIp(req);
  const headerEvent = req.headers.get("event") ?? req.headers.get("Event") ?? "";

  const rawPayload = await req.text();
  let body: Record<string, unknown>;
  try {
    body = rawPayload ? (JSON.parse(rawPayload) as Record<string, unknown>) : {};
  } catch {
    console.error("pix-webhook: invalid_json", { rawPayload: rawPayload.slice(0, 500) });
    return json(400, { error: "invalid_json" });
  }

  console.log("pix-webhook: received", {
    headerEvent,
    keys: Object.keys(body),
    clientIp,
  });

  // Aceita variações: payload direto da SyncPay, ou aninhado em data/payment/transaction.
  const dataObj = (body.data ?? body.payment ?? body.transaction ?? body) as Record<string, unknown>;

  const providerRef = String(
    pickFirst(
      dataObj.identifier,
      dataObj.reference_id,
      dataObj.id,
      body.identifier,
      body.reference_id,
      body.id,
    ) ?? "",
  );

  const amount =
    Math.round(
      Number(
        pickFirst(
          dataObj.amount,
          body.amount,
          dataObj.value,
          body.value,
          (dataObj as Record<string, unknown>).final_amount,
        ),
      ) * 100,
    ) / 100;

  const rawStatus = String(pickFirst(dataObj.status, body.status, dataObj.state, body.state) ?? "");
  const eventType = String(
    pickFirst(headerEvent, body.event, body.event_type, dataObj.event) ?? "cashin.update",
  );

  if (!providerRef || !rawStatus) {
    console.warn("pix-webhook: invalid payload", { hasRef: !!providerRef, hasStatus: !!rawStatus });
    return json(400, { error: "invalid_payload" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Idempotência: register_webhook_event tem PK em (provider, provider_event_id)
  // — mas como o mesmo identifier pode receber múltiplos eventos (create + update),
  // usamos uma chave composta. Se falhar duplicado, ignoramos.
  const dedupeKey = `${providerRef}:${rawStatus}`;
  const { data: firstSeen } = await admin.rpc("register_webhook_event", {
    p_provider: "syncpay",
    p_provider_event_id: dedupeKey,
    p_event_type: eventType,
    p_status: rawStatus,
    p_payload: body,
    p_source_ip: clientIp,
  });

  if (firstSeen === false) {
    return json(200, { ok: true, duplicated: true });
  }

  const outcome = classifyStatus(rawStatus);

  // Identifica se é cashin (depósito) ou cashout (saque) consultando o banco.
  const { data: dep } = await admin
    .from("pix_deposits")
    .select("id")
    .eq("provider_ref", providerRef)
    .maybeSingle();

  if (dep) {
    if (outcome === "paid") {
      if (!Number.isFinite(amount) || amount <= 0) {
        return json(400, { error: "invalid_amount" });
      }
      const { data, error } = await admin.rpc("confirm_pix_deposit", {
        p_provider_ref: providerRef,
        p_amount: amount,
        p_webhook_payload: body,
      });
      if (error) {
        console.error("confirm_pix_deposit:", error);
        return json(500, { error: "confirm_failed", detail: error.message });
      }
      return json(200, { ok: true, deposit_id: data, action: "confirmed" });
    }
    if (outcome === "failed") {
      await admin.rpc("cancel_pix_deposit_pending", { p_deposit_id: dep.id });
      return json(200, { ok: true, deposit_id: dep.id, action: "failed" });
    }
    return json(200, { ok: true, ignored: true, status: rawStatus });
  }

  // Cashout
  const { data: wd } = await admin
    .from("pix_withdrawals")
    .select("id")
    .eq("provider_ref", providerRef)
    .maybeSingle();

  if (wd) {
    const { data, error } = await admin.rpc("apply_syncpay_cashout_webhook", {
      p_reference_id: providerRef,
      p_status: rawStatus.toLowerCase(),
      p_payload: body,
    });
    if (error) {
      console.error("apply_syncpay_cashout_webhook:", error);
      return json(500, { error: "cashout_update_failed" });
    }
    return json(200, { ok: true, withdrawal_id: data });
  }

  console.warn("pix-webhook: unknown provider_ref", { providerRef, status: rawStatus });
  return json(200, { ok: true, unknown_ref: true });
});
