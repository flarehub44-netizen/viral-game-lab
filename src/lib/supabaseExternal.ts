import { createClient } from "@supabase/supabase-js";

// =====================================================
// Supabase EXTERNO — projeto pbkdmcjlscjdvkaiypye
// =====================================================
// IMPORTANTE: Substitua EXTERNAL_ANON_KEY pela sua anon key real.
// Encontra em: Supabase Dashboard → Project Settings → API → anon public

const EXTERNAL_SUPABASE_URL = "https://pbkdmcjlscjdvkaiypye.supabase.co";
const EXTERNAL_ANON_KEY = "COLE_SUA_ANON_KEY_AQUI";

export const supabase = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/** Project ID for constructing edge function URLs */
export const EXTERNAL_PROJECT_ID = "pbkdmcjlscjdvkaiypye";
