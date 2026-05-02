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

describe("shouldTerminateScriptRound (deprecated, Fase 1 do payout dinâmico)", () => {
  it("never terminates by script — game over só quando todas as bolas morrem", () => {
    // Mesmo com todas as condições antigas batidas (alvo, score, duração) → false.
    expect(
      shouldTerminateScriptRound({
        script,
        allowScriptTerminate: true,
        state: "playing",
        aliveAfter: 2,
        elapsedSec: 25,
        barriersPassedCount: 99,
        score: 9999,
      }),
    ).toBe(false);
  });

  it("returns false when script is null", () => {
    expect(
      shouldTerminateScriptRound({
        script: null,
        allowScriptTerminate: true,
        state: "playing",
        aliveAfter: 5,
        elapsedSec: 0,
        barriersPassedCount: 0,
        score: 0,
      }),
    ).toBe(false);
  });
});
