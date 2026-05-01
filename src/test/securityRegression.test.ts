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
