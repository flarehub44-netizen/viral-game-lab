import { toast } from "sonner";

/** Códigos `error` retornados pelas Edge Functions PIX / perfil. */
const MESSAGES: Record<string, string> = {
  invalid_cpf_in_profile: "Cadastre um CPF válido no perfil antes de depositar.",
  phone_required_in_profile: "Cadastre um celular com DDD (10 ou 11 dígitos) no perfil.",
  profile_load_failed: "Não foi possível carregar seu perfil. Tente de novo.",
  request_failed: "Não foi possível concluir a operação.",
  invalid_amount: "Valor inválido. Use entre R$ 5,00 e R$ 5.000,00.",
  invalid_pix_key: "Chave PIX inválida.",
  invalid_cpf_pix_key: "CPF da chave PIX inválido.",
  invalid_email_pix_key: "E-mail da chave PIX inválido.",
  invalid_phone_pix_key: "Telefone da chave PIX inválido.",
  invalid_evp_pix_key: "Chave aleatória (EVP) inválida.",
  insufficient_balance: "Saldo insuficiente.",
  kyc_required: "Verificação de identidade (KYC) aprovada é necessária para sacar.",
  rate_limited: "Muitas tentativas. Aguarde um instante e tente de novo.",
  unauthorized: "Sessão expirada. Entre novamente.",
  invalid_session: "Sessão inválida. Entre novamente.",
  syncpay_cashin_failed: "Falha ao gerar cobrança no provedor PIX. Tente mais tarde.",
  syncpay_cashout_failed: "Falha ao solicitar saque no provedor PIX. Tente mais tarde.",
  syncpay_webhook_url_missing: "Configuração do servidor incompleta (webhook PIX).",
  deposit_create_failed: "Não foi possível registrar o depósito.",
  withdraw_request_failed: "Não foi possível registrar o saque.",
  invalid_cpf: "CPF inválido.",
  invalid_phone: "Telefone inválido.",
  cpf_already_used: "Este CPF já está vinculado a outra conta.",
  not_authenticated: "Entre na sua conta para continuar.",
};

export function pixEdgeErrorMessage(code: string | undefined): string {
  if (!code) return "Não foi possível concluir a operação.";
  return MESSAGES[code] ?? `Erro: ${code}`;
}

export function toastPixEdgeError(code: string | undefined): void {
  toast.error(pixEdgeErrorMessage(code));
}

type InvokeErr = Error & { context?: { json?: () => Promise<unknown> } };

export async function parsePixInvokeError(
  data: unknown,
  error: InvokeErr | null,
): Promise<string | undefined> {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string") return e;
  }
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = (await error.context.json()) as { error?: unknown };
      if (typeof body?.error === "string") return body.error;
    } catch {
      /* ignore */
    }
  }
  if (error?.message) {
    const m = error.message;
    const j = m.match(/\{[\s\S]*"error"\s*:\s*"([^"]+)"/);
    if (j?.[1]) return j[1];
  }
  return undefined;
}
