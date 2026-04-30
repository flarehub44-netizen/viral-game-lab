import { describe, expect, it } from "vitest";

type EndRoundInput = {
  roundStatus: "open" | "closed" | "expired" | "rejected";
  timedOut: boolean;
  alive: number;
  seedMatches: boolean;
  signatureMatches: boolean;
};

function validateLikeServer(input: EndRoundInput): "ok" | "already_settled" | string {
  if (input.roundStatus !== "open") return "already_settled";
  if (!input.timedOut && input.alive > 0) return "alive_must_be_zero_or_timeout";
  if (!input.seedMatches) return "layout_mismatch_seed";
  if (!input.signatureMatches) return "layout_mismatch_signature";
  return "ok";
}

describe("end-round validation guards", () => {
  it("treats replay as idempotent already_settled", () => {
    expect(
      validateLikeServer({
        roundStatus: "closed",
        timedOut: false,
        alive: 0,
        seedMatches: true,
        signatureMatches: true,
      }),
    ).toBe("already_settled");
  });

  it("fails when alive > 0 without timeout", () => {
    expect(
      validateLikeServer({
        roundStatus: "open",
        timedOut: false,
        alive: 1,
        seedMatches: true,
        signatureMatches: true,
      }),
    ).toBe("alive_must_be_zero_or_timeout");
  });

  it("fails on layout mismatch", () => {
    expect(
      validateLikeServer({
        roundStatus: "open",
        timedOut: false,
        alive: 0,
        seedMatches: false,
        signatureMatches: true,
      }),
    ).toBe("layout_mismatch_seed");
  });

  it("fails on signature mismatch exploit", () => {
    expect(
      validateLikeServer({
        roundStatus: "open",
        timedOut: false,
        alive: 0,
        seedMatches: true,
        signatureMatches: false,
      }),
    ).toBe("layout_mismatch_signature");
  });

  it("allows alive > 0 only when timed out", () => {
    expect(
      validateLikeServer({
        roundStatus: "open",
        timedOut: true,
        alive: 3,
        seedMatches: true,
        signatureMatches: true,
      }),
    ).toBe("ok");
  });
});
