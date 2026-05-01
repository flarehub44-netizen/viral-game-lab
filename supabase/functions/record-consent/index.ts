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

const ALLOWED_TYPES = ["tos", "privacy_policy", "age_confirmation"] as const;
type DocType = (typeof ALLOWED_TYPES)[number];

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

  let body: { document_type?: unknown; document_version?: unknown };
  try {
    body = (await req.json()) as { document_type?: unknown; document_version?: unknown };
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const docType = typeof body.document_type === "string" ? body.document_type : "";
  const docVersion = typeof body.document_version === "string" ? body.document_version.trim().slice(0, 20) : "";

  if (!(ALLOWED_TYPES as readonly string[]).includes(docType)) {
    return json(400, { error: "invalid_document_type", allowed: ALLOWED_TYPES });
  }
  if (!docVersion) {
    return json(400, { error: "document_version_required" });
  }

  const { data, error } = await admin
    .from("user_consents")
    .insert({
      user_id:          user.id,
      document_type:    docType as DocType,
      document_version: docVersion,
      ip_address:       req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent:       req.headers.get("user-agent")?.slice(0, 200) ?? null,
    })
    .select("id, document_type, document_version, accepted_at")
    .single();

  if (error) {
    console.error("record-consent insert:", error);
    return json(500, { error: "consent_record_failed" });
  }

  return json(200, { ok: true, consent: data });
});
