import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { syncPayCreateCashOut } from "../_shared/syncpay.ts";

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
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() ?? null;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
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

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePixKey(pixKey: string, pixKeyType: string): string | null {
  if (pixKeyType === "cpf") {
    const digits = normalizeDigits(pixKey);
    if (!isValidCpf(digits)) return "invalid_cpf_pix_key";
  } else if (pixKeyType === "email") {
    if (!RE_EMAIL.test(pixKey)) return "invalid_email_pix_key";
  } else if (pixKeyType === "phone") {
    const digits = normalizeDigits(pixKey);
    if (digits.length < 10 || digits.length > 11) return "invalid_phone_pix_key";
  } else if (pixKeyType === "evp") {
    if (!RE_EVP.test(pixKey)) return "invalid_evp_pix_key";
  }
  return null;
}

function toSyncPayPixType(pixKeyType: string): "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP" {
  if (pixKeyType === "cpf") return "CPF";
  if (pixKeyType === "email") return "EMAIL";
  if (pixKeyType === "phone") return "PHONE";
  return "EVP";
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

  let body: { amount?: unknown; pix_key?: unknown; pix_key_type?: unknown };
  try {
    body = (await req.json()) as { amount?: unknown; pix_key?: unknown; pix_key_type?: unknown };
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const amount = Math.round(Number(body.amount) * 100) / 100;
  const pixKey = typeof body.pix_key === "string" ? body.pix_key.trim() : "";
  const pixKeyType = typeof body.pix_key_type === "string" ? body.pix_key_type.trim() : "";
  if (!Number.isFinite(amount) || amount < 5 || amount > 5000) return json(400, { error: "invalid_amount" });
  if (!pixKey || !["cpf", "email", "phone", "evp"].includes(pixKeyType)) {
    return json(400, { error: "invalid_pix_key" });
  }
  const pixKeyErr = validatePixKey(pixKey, pixKeyType);
  if (pixKeyErr) return json(400, { error: pixKeyErr });

  const { data: allowRate } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "request-pix-withdrawal",
    p_ip: extractClientIp(req),
    p_device_fingerprint: req.headers.get("x-device-fingerprint"),
    p_limit: 3,
    p_window_seconds: 300,
  });
  if (!allowRate) return json(429, { error: "rate_limited" });

  // get_user_pix_identity returns decrypted CPF (falls back to plaintext before backfill)
  const { data: identityRows } = await admin.rpc("get_user_pix_identity", {
    p_user_id: user.id,
  });
  const profile = Array.isArray(identityRows) ? identityRows[0] : null;

  if (profile?.deleted_at) {
    return json(403, { error: "account_deleted" });
  }
  if (!profile?.over_18_confirmed_at || profile.kyc_status !== "approved") {
    return json(403, { error: "kyc_required" });
  }

  const ownerCpfDigits = normalizeDigits(typeof profile.cpf === "string" ? profile.cpf : "");
  if (!isValidCpf(ownerCpfDigits)) {
    return json(400, { error: "invalid_cpf_in_profile" });
  }

  // Passo 1: reserva saldo e cria registro no banco ANTES de chamar SyncPay.
  // Evita double-spend se o banco falhar após o SyncPay ter executado.
  const { data: withdrawalId, error: wdErr } = await admin.rpc("request_pix_withdrawal", {
    p_user_id: user.id,
    p_amount: amount,
    p_pix_key: pixKey,
    p_pix_key_type: pixKeyType,
    // provider_ref omitido: será definido em finalize_pix_withdrawal após SyncPay
  });
  if (wdErr) {
    const msg = wdErr.message ?? "";
    if (msg.includes("insufficient_balance")) return json(400, { error: "insufficient_balance" });
    return json(500, { error: "withdraw_request_failed" });
  }

  // Passo 2: chama SyncPay. Em caso de falha, reverte o saldo.
  let syncPayResp: { reference_id: string; message: string };
  try {
    syncPayResp = await syncPayCreateCashOut({
      amount,
      description: `Neon withdrawal user=${user.id}`,
      pix_key_type: toSyncPayPixType(pixKeyType),
      pix_key: pixKey,
      document: {
        type: "cpf",
        number: pixKeyType === "cpf" ? normalizeDigits(pixKey) : ownerCpfDigits,
      },
    });
  } catch (e) {
    console.error("syncPayCreateCashOut:", e);
    // Reverte: restaura saldo e marca withdrawal como failed
    const { error: revErr } = await admin.rpc("reverse_pix_withdrawal", {
      p_withdrawal_id: withdrawalId,
    });
    if (revErr) {
      console.error("reverse_pix_withdrawal failed — manual intervention required:", revErr, { withdrawalId });
    }
    return json(502, { error: "syncpay_cashout_failed" });
  }

  // Passo 3: vincula provider_ref ao registro criado no banco
  const { error: finalErr } = await admin.rpc("finalize_pix_withdrawal", {
    p_withdrawal_id: withdrawalId,
    p_provider_ref: syncPayResp.reference_id,
  });
  if (finalErr) {
    // SyncPay já enviou — logar para intervenção manual mas não reverter
    console.error("finalize_pix_withdrawal failed:", finalErr, {
      withdrawalId,
      syncpay_ref: syncPayResp.reference_id,
    });
  }

  return json(200, {
    ok: true,
    withdrawal_id: withdrawalId,
    status: "requested",
    provider_ref: syncPayResp.reference_id,
    provider_message: syncPayResp.message,
  });
});
