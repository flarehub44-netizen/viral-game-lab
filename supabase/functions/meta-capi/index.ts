// Meta Conversions API relay — server-side mirror of fbq events for dedupe.
// Pixel ID is hard-coded; access token comes from META_CAPI_ACCESS_TOKEN secret.
// Public function (verify_jwt = false) — events may fire pre-login.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PIXEL_ID = "1234167135525222";
const GRAPH_URL = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events`;

interface UserData {
  em?: string | null;
  ph?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  client_user_agent?: string | null;
}

interface IncomingEvent {
  event_name: string;
  event_id?: string;
  event_time?: number;
  event_source_url?: string;
  action_source?: string;
  custom_data?: Record<string, unknown>;
  user_data?: UserData;
}

async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_token" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: IncomingEvent;
  try {
    body = (await req.json()) as IncomingEvent;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_json" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!body?.event_name || typeof body.event_name !== "string") {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_event_name" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const ud = body.user_data ?? {};
  const hashed: Record<string, string | string[]> = {};
  if (ud.em) hashed.em = await sha256(ud.em);
  if (ud.ph) hashed.ph = await sha256(ud.ph.replace(/\D/g, ""));
  if (ud.fbp) hashed.fbp = ud.fbp;
  if (ud.fbc) hashed.fbc = ud.fbc;
  if (ud.client_user_agent) hashed.client_user_agent = ud.client_user_agent;
  const ip = getClientIp(req);
  if (ip) hashed.client_ip_address = ip;

  const payload = {
    data: [
      {
        event_name: body.event_name,
        event_time: body.event_time ?? Math.floor(Date.now() / 1000),
        event_id: body.event_id,
        event_source_url: body.event_source_url,
        action_source: body.action_source ?? "website",
        user_data: hashed,
        custom_data: body.custom_data ?? {},
      },
    ],
    access_token: token,
  };

  try {
    const resp = await fetch(GRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error("[meta-capi] graph error", resp.status, text);
      return new Response(
        JSON.stringify({ ok: false, status: resp.status, error: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ ok: true, response: text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[meta-capi] fetch failed", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
