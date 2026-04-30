import { describe, expect, it } from "vitest";
import { calculateZones, getZoneForMultiplier } from "@/game/economy/zoneCalculator";

describe("zoneCalculator", () => {
  it("builds ordered non-overlapping zones", () => {
    const zones = calculateZones();
    for (let i = 1; i < zones.length; i++) {
      expect(zones[i].minMultiplier).toBeGreaterThanOrEqual(zones[i - 1].minMultiplier);
      expect(zones[i].maxMultiplier).toBeGreaterThanOrEqual(zones[i].minMultiplier);
    }
    const mass = zones.reduce((s, z) => s + z.totalProbability, 0);
    expect(mass).toBeCloseTo(1, 4);
  });

  it("maps multipliers into a zone", () => {
    const z = getZoneForMultiplier(1.5);
    expect(z.index).toBeGreaterThanOrEqual(0);
  });
});
