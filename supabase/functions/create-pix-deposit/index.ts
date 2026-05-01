import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { syncPayCreateCashIn } from "../_shared/syncpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-fingerprint, idempotency-key",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() ?? null;
}

function normalizeDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/** Valida CPF pelo algoritmo de dígitos verificadores (rejeita CPFs triviais). */
function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // ex: 00000000000, 11111111111

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10 || d1 === 11) d1 = 0;
  if (d1 !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10 || d2 === 11) d2 = 0;
  return d2 === Number(digits[10]);
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

  const { data: allowRate } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "create-pix-deposit",
    p_ip: extractClientIp(req),
    p_device_fingerprint: req.headers.get("x-device-fingerprint"),
    p_limit: 4,
    p_window_seconds: 60,
  });
  if (!allowRate) return json(429, { error: "rate_limited" });

  let body: { amount?: unknown; idempotency_key?: unknown };
  try {
    body = (await req.json()) as { amount?: unknown; idempotency_key?: unknown };
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 5 || amount > 5000) {
    return json(400, { error: "invalid_amount" });
  }

  const idempotencyKey =
    typeof body.idempotency_key === "string" ? body.idempotency_key.trim().slice(0, 64) : null;

  // get_user_pix_identity returns decrypted CPF (falls back to plaintext before backfill)
  const { data: identityRows, error: profErr } = await admin.rpc("get_user_pix_identity", {
    p_user_id: user.id,
  });
  const prof = Array.isArray(identityRows) ? identityRows[0] : null;

  if (profErr || !prof) {
    console.error("get_user_pix_identity:", profErr);
    return json(500, { error: "profile_load_failed" });
  }

  if (prof.deleted_at) {
    return json(403, { error: "account_deleted" });
  }

  if (!prof.over_18_confirmed_at) {
    return json(403, { error: "age_required" });
  }

  const profileName = typeof prof.display_name === "string" ? String(prof.display_name).trim() : "";
  const clientName = profileName || user.email?.split("@")[0] || "Player";
  const cpf = normalizeDigits(typeof prof.cpf === "string" ? prof.cpf : "");
  const phone = normalizeDigits(typeof prof.phone === "string" ? prof.phone : "");
  if (!isValidCpf(cpf)) return json(400, { error: "invalid_cpf_in_profile" });
  if (phone.length < 10 || phone.length > 11) return json(400, { error: "phone_required_in_profile" });
  if (!user.email) return json(400, { error: "email_required" });

  const webhookUrl = Deno.env.get("SYNC_PAY_WEBHOOK_URL");
  if (!webhookUrl) return json(500, { error: "syncpay_webhook_url_missing" });

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // Passo 1: cria registro pendente no banco ANTES de chamar SyncPay.
  // Se idempotency_key for fornecida e o depósito já existir, retorna o ID existente.
  const { data: depId, error: depErr } = await admin.rpc("create_pix_deposit_pending", {
    p_user_id: user.id,
    p_amount: amount,
    p_expires_at: expiresAt,
    p_idempotency_key: idempotencyKey,
  });
  if (depErr) {
    console.error("create_pix_deposit_pending:", depErr);
    return json(500, { error: "deposit_create_failed" });
  }

  // Idempotência: se o depósito já foi finalizado (QR code presente), retorna sem chamar SyncPay
  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("pix_deposits")
      .select("provider_ref, qr_code, expires_at")
      .eq("id", depId)
      .not("provider_ref", "is", null)
      .maybeSingle();

    if (existing?.qr_code) {
      return json(200, {
        ok: true,
        deposit_id: depId,
        provider_ref: existing.provider_ref,
        amount,
        qr_code: existing.qr_code,
        expires_at: existing.expires_at,
        idempotent: true,
      });
    }
  }

  // Passo 2: chama SyncPay. Em caso de falha, cancela o registro pendente.
  let syncPayResp: { identifier: string; pix_code: string; message: string };
  try {
    syncPayResp = await syncPayCreateCashIn({
      amount,
      description: `Neon deposit user=${user.id}`,
      webhook_url: webhookUrl,
      client: {
        name: clientName.slice(0, 80),
        cpf,
        email: user.email,
        phone,
      },
    });
  } catch (e) {
    console.error("syncPayCreateCashIn:", e);
    await admin.rpc("cancel_pix_deposit_pending", { p_deposit_id: depId });
    return json(502, { error: "syncpay_cashin_failed" });
  }

  // Passo 3: vincula os dados reais do SyncPay ao registro criado
  const { error: finalErr } = await admin.rpc("finalize_pix_deposit_pending", {
    p_deposit_id: depId,
    p_provider_ref: syncPayResp.identifier,
    p_qr_code: syncPayResp.pix_code,
  });
  if (finalErr) {
    // QR code existe no SyncPay mas sem provider_ref no DB — logar para intervenção
    console.error("finalize_pix_deposit_pending failed:", finalErr, {
      depId,
      identifier: syncPayResp.identifier,
    });
  }

  return json(200, {
    ok: true,
    deposit_id: depId,
    provider_ref: syncPayResp.identifier,
    amount,
    qr_code: syncPayResp.pix_code,
    expires_at: expiresAt,
    provider_message: syncPayResp.message,
  });
});
