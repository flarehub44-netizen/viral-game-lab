import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

describe("security regression guards", () => {
  it("enforces HMAC validation in pix-webhook", () => {
    const src = read("supabase/functions/pix-webhook/index.ts");
    expect(src).toContain("SYNC_PAY_WEBHOOK_HMAC_SECRET");
    expect(src).toContain("invalid_hmac_signature");
    expect(src).toContain("x-pix-signature");
    expect(src).toContain("x-pix-timestamp");
  });

  it("enforces strict network controls in pix-webhook (B3)", () => {
    const src = read("supabase/functions/pix-webhook/index.ts");
    // Em modo strict (produção), HMAC sozinho não basta — exige IP allowlist ou bearer.
    expect(src).toContain("SYNC_PAY_WEBHOOK_STRICT");
    expect(src).toContain("webhook_strict_requires_network_control");
  });

  it("blocks third-party CPF withdrawals (B4)", () => {
    const src = read("supabase/functions/request-pix-withdrawal/index.ts");
    expect(src).toContain("pix_key_cpf_mismatch_owner");
    expect(src).toContain("withdrawal_third_party_cpf");
  });

  it("requires idempotency key in withdrawal edge function", () => {
    const src = read("supabase/functions/request-pix-withdrawal/index.ts");
    expect(src).toContain("idempotency_key_required");
    expect(src).toContain("p_idempotency_key");
  });

  it("uses controlled RPC for profile display name updates", () => {
    const src = read("src/pages/Index.tsx");
    expect(src).toContain("set_profile_display_name");
  });
});
