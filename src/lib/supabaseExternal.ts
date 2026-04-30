import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// =====================================================
// Supabase EXTERNO — projeto pbkdmcjlscjdvkaiypye
// =====================================================
// IMPORTANTE: Substitua EXTERNAL_ANON_KEY pela sua anon key real.
// Encontra em: Supabase Dashboard → Project Settings → API → anon public

const EXTERNAL_SUPABASE_URL = "https://pbkdmcjlscjdvkaiypye.supabase.co";
const EXTERNAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBia2RtY2psc2NqZHZrYWl5cHllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTk2NDcsImV4cCI6MjA5MzEzNTY0N30.O0iFvNHx4mT8z8aNPMdqwodW3lT6wPDRfSHN1mWwCzg";

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
export const EXTERNAL_PROJECT_ID = "pbkdmcjlscjdvkaiypye";
