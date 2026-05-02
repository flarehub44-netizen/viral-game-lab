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
    // Between (5, 0.5) and (8, 0.8): at b=6.5 => 0.65
    expect(multiplierForBarriers(6.5)).toBeCloseTo(0.65, 2);
    // Between (17, 1.5) and (20, 2.0): at b=18.5 => 1.75
    expect(multiplierForBarriers(18.5)).toBeCloseTo(1.75, 2);
  });

  it("saturates at the hard cap above the last anchor", () => {
    expect(multiplierForBarriers(60)).toBe(30);
    expect(multiplierForBarriers(80)).toBe(30);
    expect(multiplierForBarriers(1_000)).toBe(30);
  });

  it("phase-2 tail anchors hit exactly", () => {
    expect(multiplierForBarriers(30)).toBeCloseTo(20, 2);
    expect(multiplierForBarriers(33)).toBeCloseTo(22, 2);
    expect(multiplierForBarriers(38)).toBeCloseTo(25, 2);
    expect(multiplierForBarriers(45)).toBeCloseTo(28, 2);
  });

  it("phase-2 tail interpolates monotonically", () => {
    const m30 = multiplierForBarriers(30);
    const m32 = multiplierForBarriers(32);
    const m35 = multiplierForBarriers(35);
    const m40 = multiplierForBarriers(40);
    expect(m32).toBeGreaterThan(m30);
    expect(m35).toBeGreaterThan(m32);
    expect(m40).toBeGreaterThan(m35);
  });

  it("anchors cover all multiplier tiers (preserves theoretical RTP)", () => {
    const anchorMults = new Set(MULTIPLIER_CURVE_ANCHORS.map(([, m]) => m));
    for (const tier of MULTIPLIER_TIERS) {
      expect(anchorMults.has(tier.multiplier)).toBe(true);
    }
  });
});
