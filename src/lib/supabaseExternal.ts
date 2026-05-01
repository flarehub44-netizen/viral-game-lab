import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const EXTERNAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const EXTERNAL_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!EXTERNAL_SUPABASE_URL || !EXTERNAL_ANON_KEY) {
  throw new Error(
    "Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env (veja Project Settings → API no Supabase).",
  );
}

// Using `any` for Database type so we bypass Lovable Cloud's auto-generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any, "public", any> = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/** Project ID for constructing edge function URLs */
export const EXTERNAL_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";
