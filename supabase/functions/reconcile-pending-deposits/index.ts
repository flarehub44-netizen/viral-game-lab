import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { syncPayGetCashIn } from "../_shared/syncpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function classifyStatus(raw: string): "paid" | "failed" | "pending" {
  const s = (raw ?? "").trim().toUpperCase();
  if (s === "PAID_OUT" || s === "PAID" || s === "COMPLETED" || s === "APPROVED") return "paid";
  if (s === "FAILED" || s === "REFUNDED" || s === "REVERSED" || s === "EXPIRED" || s === "CANCELLED" || s === "CANCELED") return "failed";
  return "pending";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Busca depósitos pendentes com provider_ref ainda dentro da janela de expiração
  // (ou expirados há até 1 hora — para capturar pagamentos tardios).
  const { data: pending, error } = await admin
    .from("pix_deposits")
    .select("id, provider_ref, amount, created_at, expires_at, user_id")
    .eq("status", "pending")
    .not("provider_ref", "is", null)
    .lte("created_at", new Date(Date.now() - 30_000).toISOString())
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(50);

  if (error) {
    console.error("query_pending_failed", error);
    return new Response(JSON.stringify({ error: "query_failed", detail: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const dep of pending ?? []) {
    try {
      const remote = await syncPayGetCashIn(dep.provider_ref as string);
      const providerStatus = String(remote.status ?? "");
      const outcome = classifyStatus(providerStatus);

      if (outcome === "pending") {
        results.push({ id: dep.id, action: "still_pending", provider_status: providerStatus });
        continue;
      }

      if (outcome === "failed") {
        await admin.rpc("cancel_pix_deposit_pending", { p_deposit_id: dep.id });
        results.push({ id: dep.id, action: "marked_failed", provider_status: providerStatus });
        continue;
      }

      // PAID_OUT — confirma e credita
      const providerAmount =
        typeof remote.amount === "number" && Number.isFinite(remote.amount)
          ? Math.round(remote.amount * 100) / 100
          : Number(dep.amount);

      const { data: confirmedId, error: confirmErr } = await admin.rpc("confirm_pix_deposit", {
        p_provider_ref: dep.provider_ref,
        p_amount: providerAmount,
        p_webhook_payload: { source: "cron_reconcile", provider_status: providerStatus },
      });
      if (confirmErr) {
        console.error("confirm_pix_deposit_failed", { id: dep.id, err: confirmErr.message });
        results.push({ id: dep.id, action: "confirm_failed", error: confirmErr.message });
      } else {
        results.push({ id: dep.id, action: "confirmed", deposit_id: confirmedId });
      }
    } catch (e) {
      console.error("syncpay_query_failed", { id: dep.id, err: String(e) });
      results.push({ id: dep.id, action: "syncpay_error", error: String(e) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, scanned: pending?.length ?? 0, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
