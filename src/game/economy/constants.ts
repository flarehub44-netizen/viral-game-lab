/** Apostas fixas (créditos). Alinhado ao validador servidor (`MIN_STAKE`–`MAX_STAKE`). */
export const BET_AMOUNTS = [1, 2, 5, 10, 20, 50] as const;

export const MIN_STAKE = 1;
export const MAX_STAKE = 50;

/** Teto de pagamento por rodada (espelha Edge `start-round`). */
export const MAX_ROUND_PAYOUT = 400;

/** Meta de multiplicador exibida na UI (teto teórico de payout em multiplicadores da entrada). */
export const DEFAULT_META_MULTIPLIER = 20;

/** Saldo inicial para demonstração (somente local/demo). */
export const INITIAL_WALLET_BALANCE = 150;

/** Saldo inicial para contas reais (online). */
export const INITIAL_ONLINE_WALLET_BALANCE = 0;

/** Máximo de lançamentos no histórico persistido. */
export const MAX_TRANSACTION_HISTORY = 80;

/** RTP empírico alvo (perfil casual) após rebalanço — tiers altos raros + cauda achatada. */
export const TARGET_RTP = 52.0;
