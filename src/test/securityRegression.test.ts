import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

describe("security regression guards", () => {
  it("pix-webhook validates payload and supports optional bearer", () => {
    const src = read("supabase/functions/pix-webhook/index.ts");
    expect(src).toContain("SYNC_PAY_WEBHOOK_BEARER_TOKEN");
    expect(src).toContain("invalid_payload");
    expect(src).toContain("classifyStatus");
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
