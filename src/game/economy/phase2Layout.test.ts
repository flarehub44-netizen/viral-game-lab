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

  it("post-target rows have monotonically smaller gaps", () => {
    const rows = generateDeterministicLayout(seed, target);
    const post = rows.slice(target + 1, target + 11);
    // Gap shouldn't increase as we move further past the target
    for (let i = 1; i < post.length; i++) {
      expect(post[i]!.gapSize).toBeLessThanOrEqual(post[i - 1]!.gapSize + 1e-9);
    }
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
