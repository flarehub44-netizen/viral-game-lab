const DEFAULT_BASE_URL = "https://api.syncpayments.com.br";

export interface SyncPayAuth {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: string;
}

export interface SyncPayCashInRequest {
  amount: number;
  description?: string;
  webhook_url: string;
  client: {
    name: string;
    cpf: string;
    email: string;
    phone: string;
  };
}

export interface SyncPayCashInResponse {
  message: string;
  pix_code: string;
  identifier: string;
}

export interface SyncPayCashOutRequest {
  amount: number;
  description?: string;
  pix_key_type: "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";
  pix_key: string;
  document: {
    type: "cpf" | "cnpj";
    number: string;
  };
}

export interface SyncPayCashOutResponse {
  message: string;
  reference_id: string;
}

function envOrThrow(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing_env_${name}`);
  return value;
}

function getBaseUrl(): string {
  return Deno.env.get("SYNC_PAY_BASE_URL") ?? DEFAULT_BASE_URL;
}

async function syncPayFetch<T>(path: string, init: RequestInit, bearerToken?: string): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const rawText = await res.text();
  let payload: unknown = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { message: rawText || "invalid_json_response" };
  }
  if (!res.ok) {
    throw new Error(`syncpay_http_${res.status}:${JSON.stringify(payload)}`);
  }
  return payload as T;
}

/** Cache in-process: SyncPay pede para não renovar o token antes de expirar (~1h). */
let cachedAuth: { token: string; expiresAtMs: number } | null = null;
const TOKEN_SKEW_MS = 60_000;

function parseExpiresAtMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export async function syncPayAuthToken(): Promise<SyncPayAuth> {
  const now = Date.now();
  if (cachedAuth && cachedAuth.expiresAtMs - TOKEN_SKEW_MS > now) {
    return {
      access_token: cachedAuth.token,
      token_type: "Bearer",
      expires_in: Math.max(60, Math.floor((cachedAuth.expiresAtMs - now) / 1000)),
      expires_at: new Date(cachedAuth.expiresAtMs).toISOString(),
    };
  }

  const clientId = envOrThrow("SYNC_PAY_CLIENT_ID");
  const clientSecret = envOrThrow("SYNC_PAY_CLIENT_SECRET");
  const auth = await syncPayFetch<SyncPayAuth>("/api/partner/v1/auth-token", {
    method: "POST",
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const fromIso = parseExpiresAtMs(auth.expires_at);
  const fromTtl = now + Math.max(0, (auth.expires_in ?? 3600) * 1000);
  const expiresAtMs = fromIso > now ? fromIso : fromTtl;
  cachedAuth = { token: auth.access_token, expiresAtMs };
  return auth;
}

export async function syncPayCreateCashIn(payload: SyncPayCashInRequest): Promise<SyncPayCashInResponse> {
  const auth = await syncPayAuthToken();
  return await syncPayFetch<SyncPayCashInResponse>(
    "/api/partner/v1/cash-in",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    auth.access_token,
  );
}

export type SyncPayTransactionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded"
  | "med"
  | string;

export interface SyncPayTransactionData {
  reference_id: string;
  currency: string;
  amount: number;
  transaction_date?: string;
  status: SyncPayTransactionStatus;
  description?: string | null;
  pix_code?: string | null;
}

export interface SyncPayTransactionResponse {
  data: SyncPayTransactionData;
}

/**
 * Consulta o status de uma transação (cash-in ou cash-out) usando o endpoint
 * oficial `/api/partner/v1/transaction/{identifier}`. Usado pela reconciliação
 * quando o webhook não chegou.
 */
export async function syncPayGetTransaction(
  identifier: string,
): Promise<SyncPayTransactionData> {
  const auth = await syncPayAuthToken();
  const resp = await syncPayFetch<SyncPayTransactionResponse>(
    `/api/partner/v1/transaction/${encodeURIComponent(identifier)}`,
    { method: "GET" },
    auth.access_token,
  );
  return resp.data;
}

export async function syncPayCreateCashOut(payload: SyncPayCashOutRequest): Promise<SyncPayCashOutResponse> {
  const auth = await syncPayAuthToken();
  return await syncPayFetch<SyncPayCashOutResponse>(
    "/api/partner/v1/cash-out",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    auth.access_token,
  );
}

export function isValidSyncPayWebhookAuthorization(authHeader: string | null): boolean {
  const expected = Deno.env.get("SYNC_PAY_WEBHOOK_BEARER_TOKEN");
  if (!expected) return false;
  const got = authHeader?.replace(/^Bearer\s+/i, "") ?? "";
  return got.length > 0 && got === expected;
}
