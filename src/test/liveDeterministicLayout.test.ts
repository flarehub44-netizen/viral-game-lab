import { describe, expect, it } from "vitest";
import { generateDeterministicLayout } from "@/game/economy/liveDeterministicLayout";

describe("liveDeterministicLayout", () => {
  it("returns same layout for same seed", () => {
    const a = generateDeterministicLayout("seed-abc", 12, 10);
    const b = generateDeterministicLayout("seed-abc", 12, 10);
    expect(a).toEqual(b);
  });
});
