import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SubmitBody {
  nickname?: unknown;
  score?: unknown;
  max_multiplier?: unknown;
  duration_seconds?: unknown;
}

function sanitizeNickname(raw: string): string {
  const trimmed = raw.trim().slice(0, 20);
  // Strip control chars
  return trimmed.replace(/[\u0000-\u001F\u007F]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as SubmitBody;

    const nicknameRaw = typeof body.nickname === "string" ? body.nickname : "";
    const score = Number(body.score);
    const maxMult = Number(body.max_multiplier);
    const duration = Number(body.duration_seconds);

    const nickname = sanitizeNickname(nicknameRaw);

    if (
      !nickname ||
      nickname.length < 1 ||
      nickname.length > 20 ||
      !Number.isFinite(score) ||
      !Number.isFinite(maxMult) ||
      !Number.isFinite(duration) ||
      score < 0 ||
      score > 10_000_000 ||
      maxMult < 1 ||
      maxMult > 4096 ||
      duration < 0 ||
      duration > 3600
    ) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anti-cheat: score plausibility based on duration & combo multiplier.
    // Quadratic scoring with up to ~256 balls and combo stacking can yield
    // very high values per barrier. Use a generous upper bound.
    const secs = Math.max(10, duration);
    const theoreticalMax = secs * Math.min(maxMult, 4096) * 2000;
    if (score > theoreticalMax) {
      return new Response(JSON.stringify({ error: "Implausible score" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabase
      .from("scores")
      .insert({
        nickname,
        score: Math.floor(score),
        max_multiplier: Math.floor(maxMult),
        duration_seconds: Math.floor(duration),
      })
      .select("id")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: "Could not save score" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(JSON.stringify({ error: "Bad request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
