import { supabase } from "@/lib/supabaseExternal";

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  rollout_percent: number;
  rules: Record<string, unknown> | null;
};

function stableHash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function isUserInRollout(userId: string, percent: number): boolean {
  const bucket = stableHash(userId) % 100;
  return bucket < Math.max(0, Math.min(100, percent));
}

export async function isFeatureEnabledForUser(flagKey: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key,enabled,rollout_percent,rules")
    .eq("key", flagKey)
    .maybeSingle();
  if (error || !data) return false;
  const row = data as FeatureFlagRow;
  if (!row.enabled) return false;
  return isUserInRollout(userId, row.rollout_percent ?? 0);
}
