import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SubmitBody {
  nickname?: unknown;
  date_key?: unknown;
  score?: unknown;
  max_multiplier?: unknown;
  duration_seconds?: unknown;
}

function sanitizeNickname(raw: string): string {
  return raw.trim().slice(0, 20).replace(/[\u0000-\u001F\u007F]/g, "");
}

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function isValidDateKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // Aceita só hoje ou ontem (UTC) — defesa contra reposts
  const today = todayKey();
  const y = new Date();
  y.setUTCDate(y.getUTCDate() - 1);
  const yKey = `${y.getUTCFullYear()}-${String(y.getUTCMonth() + 1).padStart(2, "0")}-${String(y.getUTCDate()).padStart(2, "0")}`;
  return s === today || s === yKey;
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
    const nickname = sanitizeNickname(typeof body.nickname === "string" ? body.nickname : "");
    const dateKey = typeof body.date_key === "string" ? body.date_key : "";
    const score = Number(body.score);
    const maxMult = Number(body.max_multiplier);
    const duration = Number(body.duration_seconds);

    if (
      !nickname ||
      nickname.length < 1 ||
      !isValidDateKey(dateKey) ||
      !Number.isFinite(score) ||
      !Number.isFinite(maxMult) ||
      !Number.isFinite(duration) ||
      score < 0 ||
      score > 1_000_000_000 ||
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
      .from("daily_scores")
      .insert({
        date_key: dateKey,
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
