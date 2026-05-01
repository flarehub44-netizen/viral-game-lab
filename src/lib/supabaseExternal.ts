/**
 * Reexporta o cliente Supabase oficial do Lovable Cloud.
 *
 * Histórico: este arquivo originalmente criava um segundo cliente lendo
 * `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Em
 * builds publicados onde essas envs não são injetadas, isso quebrava o app
 * inteiro com "Defina VITE_SUPABASE_URL...". Agora delegamos ao cliente
 * gerenciado em `@/integrations/supabase/client`, que é sempre configurado
 * corretamente pelo Lovable Cloud.
 */
import { supabase } from "@/integrations/supabase/client";

export { supabase };

/** Project ID para construir URLs de edge functions, quando necessário. */
export const EXTERNAL_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "";
