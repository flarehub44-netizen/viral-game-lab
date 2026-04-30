import { describe, expect, it } from "vitest";
import { shouldTerminateScriptRound } from "@/game/engine";
import type { RoundScript } from "@/game/economy/multiplierTable";

const script: RoundScript = {
  barriers_crossed: 3,
  balls_count: 8,
  score_target: 100,
  duration_seconds: 20,
  finish_type: "test",
};

describe("shouldTerminateScriptRound", () => {
  it("does not terminate in demo mode when script termination is disabled", () => {
    const should = shouldTerminateScriptRound({
      script,
      allowScriptTerminate: false,
      state: "playing",
      aliveAfter: 5,
      elapsedSec: 25,
      barriersPassedCount: 4,
      score: 120,
    });
    expect(should).toBe(false);
  });

  it("keeps server reveal behavior in online mode", () => {
    const should = shouldTerminateScriptRound({
      script,
      allowScriptTerminate: true,
      state: "playing",
      aliveAfter: 2,
      elapsedSec: 25,
      barriersPassedCount: 1,
      score: 50,
    });
    expect(should).toBe(true);
  });
});
