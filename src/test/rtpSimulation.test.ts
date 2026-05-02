import { describe, expect, it } from "vitest";
import { sampleMultiplier, theoreticalRtp } from "@/game/economy/multiplierTable";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulateRtp(seed: number, rounds: number): number {
  const rng = mulberry32(seed);
  const stake = 1;
  let wagered = 0;
  let paid = 0;
  for (let i = 0; i < rounds; i++) {
    wagered += stake;
    paid += stake * sampleMultiplier(rng);
  }
  return paid / wagered;
}

describe("rtp simulation", () => {
  it("stays close to target on 10k rounds (single seed)", () => {
    const rtp = simulateRtp(123456789, 10_000);
    expect(rtp).toBeGreaterThan(0.82);
    expect(rtp).toBeLessThan(0.89);
  });

  it("100k rounds across 10 independent seeds — aggregate within tight band", () => {
    // 10 seeds × 10k rounds = 100k rounds total.
    // Each individual run allows ±7pp variance; the aggregate must land within ±2pp of target.
    const seeds = [1, 42, 99, 314159, 271828, 777, 123456789, 987654321, 55555, 100_000_001];
    const target = theoreticalRtp();

    let totalWagered = 0;
    let totalPaid = 0;

    for (const seed of seeds) {
      const rng = mulberry32(seed);
      for (let i = 0; i < 10_000; i++) {
        totalWagered += 1;
        totalPaid += sampleMultiplier(rng);
      }
    }

    const aggregateRtp = totalPaid / totalWagered;

    // Each 10k run: ±7pp tolerance
    for (const seed of seeds) {
      const rtp = simulateRtp(seed, 10_000);
      expect(rtp, `seed ${seed}`).toBeGreaterThan(0.79);
      expect(rtp, `seed ${seed}`).toBeLessThan(0.93);
    }

    // 100k aggregate: must be within ±2pp of theoretical target (85.7%)
    expect(aggregateRtp).toBeGreaterThan(target - 0.02);
    expect(aggregateRtp).toBeLessThan(target + 0.02);
  });
});
