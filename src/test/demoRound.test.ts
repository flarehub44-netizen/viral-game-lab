import { beforeEach, describe, expect, it } from "vitest";
import {
  demoMultiplierFor,
  settleDemoRound,
  startDemoRound,
  validateStakeAmount,
  isValidDemoBase,
  DEMO_DEFAULT_BASE,
} from "@/game/economy/demoRound";
import { MAX_ROUND_PAYOUT } from "@/game/economy/constants";
import { loadWallet, saveWallet } from "@/game/economy/walletStore";

describe("demoRound (skill-puro com base escolhida)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("validateStakeAmount respects MIN/MAX stake", () => {
    expect(validateStakeAmount(1)).toBe(true);
    expect(validateStakeAmount(50)).toBe(true);
    expect(validateStakeAmount(51)).toBe(false);
    expect(validateStakeAmount(0)).toBe(false);
  });

  it("isValidDemoBase aceita só 2/5/10/20", () => {
    expect(isValidDemoBase(2)).toBe(true);
    expect(isValidDemoBase(5)).toBe(true);
    expect(isValidDemoBase(10)).toBe(true);
    expect(isValidDemoBase(20)).toBe(true);
    expect(isValidDemoBase(15)).toBe(false);
    expect(isValidDemoBase(0)).toBe(false);
  });

  it("demoMultiplierFor: 0 barreiras = ×0 (qualquer base)", () => {
    expect(demoMultiplierFor(0, 2)).toBe(0);
    expect(demoMultiplierFor(0, 20)).toBe(0);
  });

  // Curva pública m(b) — independente da base. Pontos âncora: (5,0.5), (11,1.0), (20,2.0), (30,20).
  it("demoMultiplierFor: âncoras da curva pública (base ignorada)", () => {
    expect(demoMultiplierFor(17, 2)).toBe(0.5);
    expect(demoMultiplierFor(37, 2)).toBe(1);
    expect(demoMultiplierFor(67, 2)).toBe(2);
    expect(demoMultiplierFor(100, 2)).toBe(20);
  });

  it("demoMultiplierFor: base é ignorada — mesmo valor para qualquer base", () => {
    expect(demoMultiplierFor(37, 10)).toBe(demoMultiplierFor(37, 2));
    expect(demoMultiplierFor(67, 20)).toBe(demoMultiplierFor(67, 5));
  });

  it("demoMultiplierFor: cap em 50 acima da última âncora (200)", () => {
    expect(demoMultiplierFor(200, 10)).toBe(50);
    expect(demoMultiplierFor(300, 10)).toBe(50);
  });

  it("startDemoRound debita a entrada e guarda a base escolhida", () => {
    const res = startDemoRound(5, 10);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.round.target_barrier).toBe(0); // sem meta obrigatória
    expect(res.round.target_multiplier).toBe(10); // base persistida
    expect(res.round.stake_amount).toBe(5);
    expect(loadWallet().balance).toBe(145);
  });

  it("startDemoRound usa base padrão se omitida", () => {
    const res = startDemoRound(5);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.round.target_multiplier).toBe(DEMO_DEFAULT_BASE);
  });

  it("startDemoRound rejeita base inválida", () => {
    const res = startDemoRound(5, 7);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect((res as { ok: false; error: string }).error).toBe("invalid_base");
  });

  it("settleDemoRound credita pagamento da curva — 37 barreiras = ×1.0", () => {
    const res = startDemoRound(10, 10);
    if (!res.ok) throw new Error("start failed");
    // 37 barreiras → ×1.0 → payout 10 → saldo 150 - 10 + 10 = 150
    const out = settleDemoRound(res.round, 37);
    expect(out.multiplier).toBe(1);
    expect(out.payout).toBe(10);
    expect(out.netResult).toBe(0);
    expect(loadWallet().balance).toBe(150);
  });

  it("settleDemoRound 67 barreiras paga ×2.0", () => {
    const res = startDemoRound(10, 2);
    if (!res.ok) throw new Error("start failed");
    const out = settleDemoRound(res.round, 67);
    expect(out.multiplier).toBe(2);
    expect(out.payout).toBe(20);
  });

  it("settleDemoRound com 0 barreiras = perdeu a entrada", () => {
    const res = startDemoRound(10, 5);
    if (!res.ok) throw new Error("start failed");
    const out = settleDemoRound(res.round, 0);
    expect(out.payout).toBe(0);
    expect(out.netResult).toBe(-10);
    expect(loadWallet().balance).toBe(140);
  });

  it("payout nunca excede MAX_ROUND_PAYOUT mesmo com base alta e muitas barreiras", () => {
    saveWallet({ ...loadWallet(), balance: 1000 });
    const res = startDemoRound(50, 20);
    if (!res.ok) throw new Error("start failed");
    // 50 × (0.05 × 20 × 1000) = 50 × 1000 = 50_000 → capa em MAX_ROUND_PAYOUT
    const out = settleDemoRound(res.round, 1000);
    expect(out.payout).toBeLessThanOrEqual(MAX_ROUND_PAYOUT);
    expect(out.payout).toBe(MAX_ROUND_PAYOUT);
  });
});
