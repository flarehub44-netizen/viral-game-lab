import { describe, expect, it } from "vitest";
import {
  MULTIPLIER_TIERS,
  sampleMultiplier,
  theoreticalRtp,
  totalProbabilityMass,
} from "./multiplierTable";

describe("multiplierTable", () => {
  it("probabilidades somam 1", () => {
    expect(totalProbabilityMass()).toBeCloseTo(1, 6);
  });

  it("RTP teórico ~53% (perfil casino, tiers altos raros)", () => {
    expect(theoreticalRtp()).toBeCloseTo(0.53, 1);
  });

  it("Monte Carlo converge para RTP teórico", () => {
    const rng = mulberry32(99_001);
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      sum += sampleMultiplier(rng);
    }
    expect(sum / n).toBeCloseTo(theoreticalRtp(), 1);
  });

  it("retorna apenas multiplicadores da tabela", () => {
    const allowed = new Set(MULTIPLIER_TIERS.map((t) => t.multiplier));
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      expect(allowed.has(sampleMultiplier(rng))).toBe(true);
    }
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
