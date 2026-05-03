/**
 * Meta Pixel + Conversions API helper
 * - Cliente: dispara fbq() (browser pixel)
 * - Servidor: replica via edge function `meta-capi` (deduplicado por event_id)
 *
 * IDs e nomes seguem padrão Meta:
 * https://developers.facebook.com/docs/meta-pixel/reference
 */

import { supabase } from "@/lib/supabaseExternal";

export const META_PIXEL_ID = "1234167135525222";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    ttq?: {
      track: (event: string, data?: Record<string, unknown>, opts?: { event_id?: string }) => void;
      page?: () => void;
      identify?: (data: Record<string, unknown>) => void;
    };
    _ns_meta_user?: { email?: string | null; phone?: string | null };
  }
}

/** Mapeia eventos padrão Meta -> TikTok. */
const META_TO_TIKTOK: Record<string, string> = {
  PageView: "Pageview",
  ViewContent: "ViewContent",
  Lead: "Lead",
  CompleteRegistration: "CompleteRegistration",
  AddPaymentInfo: "AddPaymentInfo",
  InitiateCheckout: "InitiateCheckout",
  AddToCart: "AddToCart",
  Purchase: "CompletePayment",
  Subscribe: "Subscribe",
  StartTrial: "StartTrial",
  Search: "Search",
};

function ttqTrack(event: string, data: Record<string, unknown> = {}, event_id?: string): void {
  try {
    if (typeof window !== "undefined" && window.ttq && typeof window.ttq.track === "function") {
      window.ttq.track(event, data, event_id ? { event_id } : undefined);
    }
  } catch (e) {
    console.warn("[tiktok] track failed:", e);
  }
}

export type MetaStandardEvent =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "CompleteRegistration"
  | "AddPaymentInfo"
  | "InitiateCheckout"
  | "AddToCart"
  | "Purchase"
  | "Subscribe"
  | "StartTrial"
  | "Search";

export interface MetaEventData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  num_items?: number;
  status?: string;
  predicted_ltv?: number;
  [key: string]: unknown;
}

/** UUID v4 simples (fallback se crypto.randomUUID indisponível). */
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Lê fbp/fbc do cookie para dedupe e atribuição. */
function readMetaCookies(): { fbp?: string; fbc?: string } {
  if (typeof document === "undefined") return {};
  const out: { fbp?: string; fbc?: string } = {};
  const parts = document.cookie.split(";");
  for (const p of parts) {
    const [k, v] = p.trim().split("=");
    if (k === "_fbp") out.fbp = v;
    if (k === "_fbc") out.fbc = v;
  }
  // Se _fbc não existe mas há fbclid na URL, gera um.
  if (!out.fbc && typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (fbclid) {
      out.fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
  }
  return out;
}

/**
 * Dispara evento padrão. Gera um event_id e replica via CAPI para dedupe.
 */
export async function trackMeta(
  event: MetaStandardEvent,
  data: MetaEventData = {},
  opts: { sendCapi?: boolean; userEmail?: string | null } = {},
): Promise<void> {
  const { sendCapi = true, userEmail } = opts;
  const event_id = uuid();

  // Cliente (browser pixel)
  try {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", event, data, { eventID: event_id });
    }
  } catch (e) {
    console.warn("[meta] fbq track failed:", e);
  }

  // TikTok pixel — espelha eventos padrão
  const ttkEvent = META_TO_TIKTOK[event];
  if (ttkEvent) ttqTrack(ttkEvent, data, event_id);

  if (!sendCapi) return;

  // Servidor (Conversions API) — não bloqueia UX
  try {
    const cookies = readMetaCookies();
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const eventSourceUrl = typeof window !== "undefined" ? window.location.href : "";
    const email = userEmail ?? window?._ns_meta_user?.email ?? null;
    const phone = window?._ns_meta_user?.phone ?? null;

    void supabase.functions.invoke("meta-capi", {
      body: {
        event_name: event,
        event_id,
        event_time: Math.floor(Date.now() / 1000),
        event_source_url: eventSourceUrl,
        action_source: "website",
        custom_data: data,
        user_data: {
          em: email,
          ph: phone,
          fbp: cookies.fbp ?? null,
          fbc: cookies.fbc ?? null,
          client_user_agent: userAgent,
        },
      },
    });
  } catch (e) {
    console.warn("[meta] capi invoke failed:", e);
  }
}

/** Eventos personalizados (não-standard). */
export function trackMetaCustom(
  name: string,
  data: MetaEventData = {},
): void {
  try {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("trackCustom", name, data);
    }
  } catch (e) {
    console.warn("[meta] trackCustom failed:", e);
  }
}

/** Atualiza identidade do usuário para CAPI (chame no login). */
export function setMetaUserIdentity(email: string | null, phone?: string | null): void {
  if (typeof window === "undefined") return;
  window._ns_meta_user = { email, phone: phone ?? null };
}
