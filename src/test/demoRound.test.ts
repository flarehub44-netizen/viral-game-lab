import { beforeEach, describe, expect, it } from "vitest";
import {
  demoMultiplierFor,
  settleDemoRound,
  startDemoRound,
  validateStakeAmount,
  DEMO_MULTIPLIER_CAP,
} from "@/game/economy/demoRound";
import { MAX_ROUND_PAYOUT } from "@/game/economy/constants";
import { loadWallet, saveWallet } from "@/game/economy/walletStore";

describe("demoRound (skill-puro linear)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("validateStakeAmount respects MIN/MAX stake", () => {
    expect(validateStakeAmount(1)).toBe(true);
    expect(validateStakeAmount(50)).toBe(true);
    expect(validateStakeAmount(51)).toBe(false);
    expect(validateStakeAmount(0)).toBe(false);
  });

  it("demoMultiplierFor: 0 barreiras = ×0", () => {
    expect(demoMultiplierFor(0)).toBe(0);
  });

  it("demoMultiplierFor: 20 barreiras = ×1.00", () => {
    expect(demoMultiplierFor(20)).toBe(1);
  });

  it("demoMultiplierFor: 100 barreiras é capado em ×5.00", () => {
    expect(demoMultiplierFor(100)).toBe(DEMO_MULTIPLIER_CAP);
    expect(demoMultiplierFor(500)).toBe(DEMO_MULTIPLIER_CAP);
  });

  it("startDemoRound debita a entrada e abre rodada sem meta", () => {
    const res = startDemoRound(5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.round.target_barrier).toBe(0);
    expect(res.round.stake_amount).toBe(5);
    // saldo inicial 150 - 5 = 145
    expect(loadWallet().balance).toBe(145);
  });

  it("settleDemoRound credita pagamento proporcional às barreiras", () => {
    const res = startDemoRound(10);
    if (!res.ok) throw new Error("start failed");
    // 30 barreiras → ×1.5 → payout 15 → saldo 150 - 10 + 15 = 155
    const out = settleDemoRound(res.round, 30);
    expect(out.multiplier).toBe(1.5);
    expect(out.payout).toBe(15);
    expect(out.netResult).toBe(5);
    expect(loadWallet().balance).toBe(155);
  });

  it("settleDemoRound com 0 barreiras = perdeu a entrada", () => {
    const res = startDemoRound(10);
    if (!res.ok) throw new Error("start failed");
    const out = settleDemoRound(res.round, 0);
    expect(out.payout).toBe(0);
    expect(out.netResult).toBe(-10);
    expect(loadWallet().balance).toBe(140);
  });

  it("payout nunca excede MAX_ROUND_PAYOUT", () => {
    saveWallet({ ...loadWallet(), balance: 1000 });
    const res = startDemoRound(50);
    if (!res.ok) throw new Error("start failed");
    // multiplier capado em 5 → 50×5 = 250 (abaixo do cap 400). OK.
    const out = settleDemoRound(res.round, 1000);
    expect(out.payout).toBeLessThanOrEqual(MAX_ROUND_PAYOUT);
    expect(out.multiplier).toBe(DEMO_MULTIPLIER_CAP);
  });
});
