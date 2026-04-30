import { beforeEach, describe, expect, it } from "vitest";
import { computeRoundEconomy, startDemoRound, validateStakeAmount } from "@/game/economy/demoRound";
import { mulberry32 } from "@/game/economy/settlement";
import { MAX_ROUND_PAYOUT } from "@/game/economy/constants";

describe("demoRound / computeRoundEconomy", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("validateStakeAmount respects MIN/MAX stake", () => {
    expect(validateStakeAmount(1)).toBe(true);
    expect(validateStakeAmount(50)).toBe(true);
    expect(validateStakeAmount(51)).toBe(false);
    expect(validateStakeAmount(0)).toBe(false);
  });

  it("is deterministic for the same RNG seed stream", () => {
    const rngA = mulberry32(999888777);
    const rngB = mulberry32(999888777);
    const x = computeRoundEconomy(10, rngA);
    const y = computeRoundEconomy(10, rngB);
    expect(x.resultMultiplier).toBe(y.resultMultiplier);
    expect(x.payout).toBe(y.payout);
    expect(x.netResult).toBe(y.netResult);
  });

  it("never exceeds MAX_ROUND_PAYOUT", () => {
    const hi = () => 1 - Number.EPSILON;
    const r = computeRoundEconomy(50, hi);
    expect(r.payout).toBeLessThanOrEqual(MAX_ROUND_PAYOUT);
  });

  it("uses user-selected target multiplier in demo payload", () => {
    const round = startDemoRound(1, 10);
    expect(round.ok).toBe(true);
    if (round.ok) expect(round.round.target_multiplier).toBe(10);
  });
});
