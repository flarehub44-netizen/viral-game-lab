import { describe, expect, it } from "vitest";
import { sampleMultiplier } from "@/game/economy/multiplierTable";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("rtp simulation", () => {
  it("stays close to target on 10k rounds", () => {
    const rng = mulberry32(123456789);
    const stake = 1;
    let wagered = 0;
    let paid = 0;
    for (let i = 0; i < 10_000; i++) {
      const m = sampleMultiplier(rng);
      wagered += stake;
      paid += stake * m;
    }
    const rtp = paid / wagered;
    expect(rtp).toBeGreaterThan(0.82);
    expect(rtp).toBeLessThan(0.89);
  });
});
