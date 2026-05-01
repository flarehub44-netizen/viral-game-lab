import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Fallback para pg_cron: pode ser agendado via Supabase Dashboard → Edge Functions → Schedule.
// Também pode ser invocado manualmente via cURL para forçar limpeza de rounds travados.
//
// Segurança: se CRON_SECRET estiver configurado, exige Bearer token correspondente.
// Sem o secret, aceita apenas chamadas do próprio runtime do Supabase (interno).

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const graceSeconds = Number(new URL(req.url).searchParams.get("grace") ?? 300);

  const { data: closed, error } = await admin.rpc("close_stale_open_rounds", {
    p_grace_seconds: Math.max(60, Math.min(3600, graceSeconds)),
  });

  if (error) {
    console.error("close_stale_open_rounds error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (closed > 0) {
    console.log(`Closed ${closed} stale open rounds (grace=${graceSeconds}s)`);
  }

  return new Response(JSON.stringify({ ok: true, closed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
