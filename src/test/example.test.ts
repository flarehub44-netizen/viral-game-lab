import { beforeEach, describe, expect, it } from "vitest";
import { applyRound, getRunGoals, loadProgression } from "@/game/progression";
import { getDifficultySnapshot } from "@/game/difficulty";

describe("progression", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sanitize progression data when storage is corrupted", () => {
    localStorage.setItem("ns_prog_v1", JSON.stringify({
      xp: -999,
      credits: "abc",
      totals: { totalScore: "nan" },
      missions: { date: 123, list: [{ id: "missing_id" }] },
      achievements: [1, 2],
    }));

    const data = loadProgression();
    expect(data.xp).toBe(0);
    expect(data.credits).toBe(0);
    expect(data.totals.totalScore).toBe(0);
    expect(data.missions.list.length).toBeGreaterThan(0);
    expect(data.achievements).toEqual([]);
  });

  it("awards credits for completed run goals", () => {
    const goalsCount = getRunGoals().length;
    const result = applyRound({
      score: 200,
      durationSeconds: 120,
      maxCombo: 15,
      maxAlive: 20,
      splits: 30,
      powerupsCollected: 4,
    });

    expect(result.runGoalsCompleted.length).toBe(goalsCount);
    expect(result.creditsGained).toBeGreaterThan(0);
    expect(result.data.credits).toBe(result.creditsGained);
  });

  it("isolates demo progression storage from default profile", () => {
    applyRound(
      {
        score: 50,
        durationSeconds: 30,
        maxCombo: 5,
        maxAlive: 8,
        splits: 10,
        powerupsCollected: 1,
      },
      "demo",
    );
    const demoXp = loadProgression("demo").xp;
    const mainXp = loadProgression("default").xp;
    expect(demoXp).toBeGreaterThan(0);
    expect(mainXp).toBe(0);
  });
});

describe("difficulty", () => {
  it("increases challenge as time advances", () => {
    const early = getDifficultySnapshot(10_000);
    const late = getDifficultySnapshot(120_000);
    expect(late.value).toBeGreaterThan(early.value);
    expect(late.barrierSpawnEverySec).toBeLessThan(early.barrierSpawnEverySec);
  });
});
