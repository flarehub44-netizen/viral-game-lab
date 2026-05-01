import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Fallback para o cron pg_cron 'auto-process-lgpd-deletions'.
// Deve ser agendado via Supabase Dashboard → Edge Functions → Schedule: "0 2 * * *"
// Também pode ser invocado manualmente para forçar processamento imediato.
//
// O que faz:
//   1. Chama auto_process_lgpd_deletions() — anonimiza PII das contas com
//      solicitação de deleção há ≥ 15 dias (SLA LGPD).
//   2. Para cada conta anonimizada, bane o usuário no Supabase Auth (ban_duration="876600h")
//      impedindo novos logins sem apagar registros financeiros.

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (secret) {
    const auth = req.headers.get("Authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Coleta usuários que serão processados ANTES de chamar o cron
  // (para poder banir no Auth após anonimização)
  const { data: pending } = await admin
    .from("lgpd_deletion_requests")
    .select("user_id")
    .eq("status", "requested")
    .lte("requested_at", new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString());

  const pendingUserIds: string[] = (pending ?? []).map((r: { user_id: string }) => r.user_id);

  // Executa anonimização no banco
  const { data: processed, error } = await admin.rpc("auto_process_lgpd_deletions");
  if (error) {
    console.error("auto_process_lgpd_deletions:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Bane usuários processados no Supabase Auth (impede novos logins)
  const banResults: { user_id: string; banned: boolean; error?: string }[] = [];
  for (const userId of pendingUserIds) {
    try {
      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: "876600h", // 100 anos = banimento permanente
      });
      banResults.push({ user_id: userId, banned: !banErr, error: banErr?.message });
    } catch (e) {
      banResults.push({ user_id: userId, banned: false, error: String(e) });
    }
  }

  if (processed > 0 || banResults.length > 0) {
    console.log(`LGPD: processados=${processed}, banidos=${banResults.filter((r) => r.banned).length}`);
  }

  return new Response(
    JSON.stringify({ ok: true, processed, ban_results: banResults }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
