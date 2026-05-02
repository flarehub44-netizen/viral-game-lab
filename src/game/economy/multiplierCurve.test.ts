import { describe, it, expect } from "vitest";
import { multiplierForBarriers, MULTIPLIER_CURVE_ANCHORS } from "./multiplierCurve";
import { MULTIPLIER_TIERS } from "./multiplierTable";

describe("multiplierForBarriers", () => {
  it("returns 0 for non-positive input", () => {
    expect(multiplierForBarriers(0)).toBe(0);
    expect(multiplierForBarriers(-5)).toBe(0);
    expect(multiplierForBarriers(NaN)).toBe(0);
  });

  it("matches each anchor exactly", () => {
    for (const [b, m] of MULTIPLIER_CURVE_ANCHORS) {
      expect(multiplierForBarriers(b)).toBeCloseTo(m, 2);
    }
  });

  it("interpolates linearly between anchors", () => {
    // Between (17, 0.5) and (27, 0.8): at b=22 => 0.65
    expect(multiplierForBarriers(22)).toBeCloseTo(0.65, 2);
    // Between (57, 1.5) and (67, 2.0): at b=62 => 1.75
    expect(multiplierForBarriers(62)).toBeCloseTo(1.75, 2);
  });

  it("saturates at the hard cap above the last anchor", () => {
    expect(multiplierForBarriers(200)).toBe(50);
    expect(multiplierForBarriers(300)).toBe(50);
    expect(multiplierForBarriers(1_000)).toBe(50);
  });

  it("phase-2 tail anchors hit exactly", () => {
    expect(multiplierForBarriers(100)).toBeCloseTo(20, 2);
    expect(multiplierForBarriers(110)).toBeCloseTo(26, 2);
    expect(multiplierForBarriers(127)).toBeCloseTo(32, 2);
    expect(multiplierForBarriers(150)).toBeCloseTo(40, 2);
  });

  it("phase-2 tail interpolates monotonically", () => {
    const m100 = multiplierForBarriers(100);
    const m115 = multiplierForBarriers(115);
    const m130 = multiplierForBarriers(130);
    const m160 = multiplierForBarriers(160);
    expect(m115).toBeGreaterThan(m100);
    expect(m130).toBeGreaterThan(m115);
    expect(m160).toBeGreaterThan(m130);
  });

  it("anchors cover all multiplier tiers (preserves theoretical RTP)", () => {
    const anchorMults = new Set(MULTIPLIER_CURVE_ANCHORS.map(([, m]) => m));
    for (const tier of MULTIPLIER_TIERS) {
      expect(anchorMults.has(tier.multiplier)).toBe(true);
    }
  });
});
