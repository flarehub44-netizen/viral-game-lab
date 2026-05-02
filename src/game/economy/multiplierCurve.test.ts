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
    // Between (3, 0.5) and (5, 0.8): at b=4 => 0.65
    expect(multiplierForBarriers(4)).toBeCloseTo(0.65, 2);
    // Between (11, 1.5) and (13, 2.0): at b=12 => 1.75
    expect(multiplierForBarriers(12)).toBeCloseTo(1.75, 2);
  });

  it("saturates at the hard cap above the last anchor", () => {
    expect(multiplierForBarriers(40)).toBe(50);
    expect(multiplierForBarriers(80)).toBe(50);
    expect(multiplierForBarriers(1_000)).toBe(50);
  });

  it("phase-2 tail anchors hit exactly", () => {
    expect(multiplierForBarriers(20)).toBeCloseTo(20, 2);
    expect(multiplierForBarriers(22)).toBeCloseTo(26, 2);
    expect(multiplierForBarriers(25)).toBeCloseTo(32, 2);
    expect(multiplierForBarriers(30)).toBeCloseTo(40, 2);
  });

  it("phase-2 tail interpolates monotonically", () => {
    const m20 = multiplierForBarriers(20);
    const m21 = multiplierForBarriers(21);
    const m23 = multiplierForBarriers(23);
    const m27 = multiplierForBarriers(27);
    expect(m21).toBeGreaterThan(m20);
    expect(m23).toBeGreaterThan(m21);
    expect(m27).toBeGreaterThan(m23);
  });

  it("anchors cover all multiplier tiers (preserves theoretical RTP)", () => {
    const anchorMults = new Set(MULTIPLIER_CURVE_ANCHORS.map(([, m]) => m));
    for (const tier of MULTIPLIER_TIERS) {
      expect(anchorMults.has(tier.multiplier)).toBe(true);
    }
  });
});
