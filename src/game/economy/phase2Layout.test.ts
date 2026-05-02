import { describe, it, expect } from "vitest";
import {
  buildLayoutRow,
  generateDeterministicLayout,
  mulberry32,
  hashSeed,
  PHASE2_GAP_FLOOR,
  PHASE2_SPEED_CEIL,
} from "./liveDeterministicLayout";

describe("Phase 2 — post-target difficulty escalation", () => {
  const seed = "phase2-test-seed";
  const target = 12;

  it("layout grows to count=80 by default", () => {
    const rows = generateDeterministicLayout(seed, target);
    expect(rows).toHaveLength(80);
  });

  it("post-target gap trends downward (early extras > late extras on average)", () => {
    const rows = generateDeterministicLayout(seed, target);
    const earlyExtras = rows.slice(target + 1, target + 4);
    const lateExtras = rows.slice(target + 8, target + 11);
    const avg = (xs: typeof rows) => xs.reduce((s, r) => s + r.gapSize, 0) / xs.length;
    expect(avg(lateExtras)).toBeLessThan(avg(earlyExtras));
  });

  it("respects gap floor and speed ceiling", () => {
    const rows = generateDeterministicLayout(seed, target);
    for (const row of rows) {
      expect(row.gapSize).toBeGreaterThanOrEqual(PHASE2_GAP_FLOOR - 1e-9);
      expect(row.speed).toBeLessThanOrEqual(PHASE2_SPEED_CEIL + 1e-9);
    }
  });

  it("buildLayoutRow stays deterministic given the same RNG", () => {
    const rngA = mulberry32(hashSeed(seed));
    const rngB = mulberry32(hashSeed(seed));
    for (let i = 0; i < 30; i++) {
      const a = buildLayoutRow(i, target, rngA);
      const b = buildLayoutRow(i, target, rngB);
      expect(a).toEqual(b);
    }
  });

  it("post-target speed is at least the pre-target baseline", () => {
    const rows = generateDeterministicLayout(seed, target);
    const baseline = rows[target]!.speed;
    expect(rows[target + 1]!.speed).toBeGreaterThanOrEqual(baseline);
    expect(rows[target + 5]!.speed).toBeGreaterThanOrEqual(baseline);
  });
});
