import type { RoundHistoryRow } from "./serverRound";

const KEY = "ns_demo_round_history_v1";
const MAX_ROWS = 40;

function sanitizeRow(raw: unknown): RoundHistoryRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    created_at: String(r.created_at),
    stake: Number(r.stake),
    result_multiplier: Number(r.result_multiplier),
    payout: Number(r.payout),
    net_result: Number(r.net_result),
  };
}

export function loadDemoHistory(): RoundHistoryRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeRow).filter(Boolean) as RoundHistoryRow[];
  } catch {
    return [];
  }
}

export function pushDemoHistoryRow(row: RoundHistoryRow): void {
  const next = [row, ...loadDemoHistory()].slice(0, MAX_ROWS);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}
