import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// =====================================================
// Supabase EXTERNO — projeto pbkdmcjlscjdvkaiypye
// =====================================================
// IMPORTANTE: Substitua EXTERNAL_ANON_KEY pela sua anon key real.
// Encontra em: Supabase Dashboard → Project Settings → API → anon public

const EXTERNAL_SUPABASE_URL = "https://pbkdmcjlscjdvkaiypye.supabase.co";
const EXTERNAL_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI";

// Using `any` for Database type so we bypass Lovable Cloud's auto-generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: SupabaseClient<any, "public", any> = createClient(
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

/** Project ID for constructing edge function URLs */
export const EXTERNAL_PROJECT_ID = "pbkdmcjlscjdvkaiypye";
