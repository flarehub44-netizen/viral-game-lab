import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { syncPayGetTransaction } from "../_shared/syncpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json(401, { error: "invalid_session" });

  let body: { deposit_id?: unknown };
  try {
    body = (await req.json()) as { deposit_id?: unknown };
  } catch {
    body = {};
  }

  const depositId = typeof body.deposit_id === "string" ? body.deposit_id : "";

  // Rate limit por usuário para evitar flood de polls
  const { data: allowRate } = await admin.rpc("guard_request_rate", {
    p_user_id: user.id,
    p_action: "reconcile-pix-deposit",
    p_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    p_device_fingerprint: null,
    p_limit: 30,
    p_window_seconds: 60,
  });
  if (!allowRate) return json(429, { error: "rate_limited" });

  // Carrega depósitos pendentes do usuário (limite curto). Se um id específico
  // foi enviado, prioriza ele; caso contrário, varre os pendentes recentes.
  const queryBuilder = admin
    .from("pix_deposits")
    .select("id, provider_ref, amount, status")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .not("provider_ref", "is", null);

  const { data: rows, error: rowsErr } = depositId
    ? await queryBuilder.eq("id", depositId).limit(1)
    : await queryBuilder.order("created_at", { ascending: false }).limit(5);

  if (rowsErr) {
    console.error("reconcile-pix-deposit: query failed", rowsErr);
    return json(500, { error: "query_failed" });
  }

  if (!rows || rows.length === 0) {
    return json(200, { ok: true, checked: 0, updated: [] });
  }

  const updated: Array<{
    deposit_id: string;
    status: string;
    syncpay_status: string;
  }> = [];

  for (const row of rows) {
    const providerRef = String((row as Record<string, unknown>).provider_ref ?? "");
    const depId = String((row as Record<string, unknown>).id ?? "");
    const amount = Number((row as Record<string, unknown>).amount ?? 0);
    if (!providerRef) continue;

    let tx;
    try {
      tx = await syncPayGetTransaction(providerRef);
    } catch (e) {
      console.warn("reconcile-pix-deposit: syncpay get failed", { providerRef, error: String(e) });
      continue;
    }

    const statusLower = String(tx.status ?? "").toLowerCase();
    if (statusLower === "completed") {
      const txAmount = Number(tx.amount);
      // Usa o valor do depósito local como fonte de verdade; SyncPay confirma.
      const finalAmount = Number.isFinite(txAmount) && txAmount > 0 ? txAmount : amount;
      const { error: confErr } = await admin.rpc("confirm_pix_deposit", {
        p_provider_ref: providerRef,
        p_amount: finalAmount,
        p_webhook_payload: { source: "reconcile-pix-deposit", syncpay: tx },
      });
      if (confErr) {
        console.error("reconcile-pix-deposit: confirm_pix_deposit failed", {
          providerRef,
          error: confErr.message,
        });
        continue;
      }
      updated.push({ deposit_id: depId, status: "confirmed", syncpay_status: statusLower });
    } else if (statusLower === "failed" || statusLower === "refunded" || statusLower === "med") {
      const { error: cancelErr } = await admin.rpc("cancel_pix_deposit_pending", {
        p_deposit_id: depId,
      });
      if (cancelErr) {
        console.error("reconcile-pix-deposit: cancel failed", {
          depId,
          error: cancelErr.message,
        });
        continue;
      }
      updated.push({ deposit_id: depId, status: "failed", syncpay_status: statusLower });
    }
    // pending: nada a fazer
  }

  return json(200, { ok: true, checked: rows.length, updated });
});
