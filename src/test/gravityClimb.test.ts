import { describe, expect, it } from "vitest";
import { calculateClimbTrajectory } from "@/game/GravityClimb";

describe("gravityClimb", () => {
  it("trajectory ends at final multiplier", () => {
    const steps = calculateClimbTrajectory(1.5, 25, 20);
    const last = steps[steps.length - 1];
    expect(last.multiplierAtStep).toBeCloseTo(1.5, 3);
  });

  it("duration matches last step time", () => {
    const steps = calculateClimbTrajectory(2, 30, 15);
    expect(steps[steps.length - 1].timeOffset).toBeCloseTo(30, 5);
  });

  it("never exceeds final multiplier", () => {
    const steps = calculateClimbTrajectory(0.8, 12, 8);
    for (const s of steps) expect(s.multiplierAtStep).toBeLessThanOrEqual(0.8);
  });
});
