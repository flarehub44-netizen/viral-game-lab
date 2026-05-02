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

  it("demoMultiplierFor: primeiras 7 barreiras são aquecimento (×0)", () => {
    expect(demoMultiplierFor(0, 5)).toBe(0);
    expect(demoMultiplierFor(7, 5)).toBe(0);
    expect(demoMultiplierFor(7, 20)).toBe(0);
  });

  it("demoMultiplierFor: ganho começa na 8ª barreira — 0,05 × base × (b - 7)", () => {
    // 8 barreiras × base 5 → 0.05 × 5 × 1 = 0.25
    expect(demoMultiplierFor(8, 5)).toBe(0.25);
    // 27 barreiras × base 5 → 0.05 × 5 × 20 = 5 (atinge meta da base 5)
    expect(demoMultiplierFor(27, 5)).toBe(5);
    // 27 barreiras × base 10 → 0.05 × 10 × 20 = 10
    expect(demoMultiplierFor(27, 10)).toBe(10);
    // 27 barreiras × base 20 → 0.05 × 20 × 20 = 20
    expect(demoMultiplierFor(27, 20)).toBe(20);
  });

  it("demoMultiplierFor: base afeta o multiplicador (não é ignorada)", () => {
    expect(demoMultiplierFor(20, 10)).toBeGreaterThan(demoMultiplierFor(20, 5));
    expect(demoMultiplierFor(20, 20)).toBe(demoMultiplierFor(20, 5) * 4);
  });

  it("demoMultiplierFor: continua crescendo após a meta (sem cap próprio)", () => {
    // 47 barreiras × base 5 → 0.05 × 5 × 40 = 10
    expect(demoMultiplierFor(47, 5)).toBe(10);
    // 107 barreiras × base 10 → 0.05 × 10 × 100 = 50
    expect(demoMultiplierFor(107, 10)).toBe(50);
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

  it("settleDemoRound credita pagamento — 27 barreiras × base 10 = ×10 (20 contáveis)", () => {
    const res = startDemoRound(10, 10);
    if (!res.ok) throw new Error("start failed");
    // 27 barreiras passadas → 20 contáveis → 0.05 × 10 × 20 = 10 → payout = 100
    // saldo: 150 - 10 + 100 = 240
    const out = settleDemoRound(res.round, 27);
    expect(out.multiplier).toBe(10);
    expect(out.payout).toBe(100);
    expect(out.netResult).toBe(90);
    expect(loadWallet().balance).toBe(240);
  });

  it("settleDemoRound: base 5 com 17 barreiras (10 contáveis) = ×2.5", () => {
    const res = startDemoRound(10, 5);
    if (!res.ok) throw new Error("start failed");
    const out = settleDemoRound(res.round, 17);
    expect(out.multiplier).toBe(2.5);
    expect(out.payout).toBe(25);
  });

  it("settleDemoRound: 7 barreiras ainda é zona de aquecimento = ×0", () => {
    const res = startDemoRound(10, 20);
    if (!res.ok) throw new Error("start failed");
    const out = settleDemoRound(res.round, 7);
    expect(out.multiplier).toBe(0);
    expect(out.payout).toBe(0);
    expect(out.netResult).toBe(-10);
  });

  it("settleDemoRound com 0 barreiras = perdeu a entrada", () => {
    const res = startDemoRound(10, 5);
    if (!res.ok) throw new Error("start failed");
    const out = settleDemoRound(res.round, 0);
    expect(out.payout).toBe(0);
    expect(out.netResult).toBe(-10);
    expect(loadWallet().balance).toBe(140);
  });

  it("demo não aplica teto MAX_ROUND_PAYOUT — créditos fictícios", () => {
    saveWallet({ ...loadWallet(), balance: 1000 });
    const res = startDemoRound(50, 20);
    if (!res.ok) throw new Error("start failed");
    const barriers = 1000;
    const effective = barriers - 7; // DEMO_FREE_BARRIERS
    const expected = Math.round(50 * 0.05 * 20 * effective * 100) / 100;
    const out = settleDemoRound(res.round, barriers);
    expect(out.payout).toBe(expected);
    expect(out.payout).toBeGreaterThan(MAX_ROUND_PAYOUT);
  });
});
