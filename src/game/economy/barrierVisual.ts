/**
 * Visual mapping for barriers based on their predicted payout multiplier.
 *
 * Used by the canvas engine to color/glow each barrier so players can intuitively
 * tell which barriers will pay more money when crossed.
 *
 * Two computation modes:
 *   - "live": uses the official public curve `multiplierForBarriers(index)`.
 *   - "demo": uses the demo formula `0.05 × demoBase × index`.
 */
import { multiplierForBarriers } from "./multiplierCurve";
import { DEMO_FREE_BARRIERS } from "./demoRound";

const DEMO_PER_BARRIER_FACTOR = 0.05;

export interface BarrierVisualStyle {
  /** HSL hue */
  hue: number;
  /** HSL saturation 0-100 */
  sat: number;
  /** HSL lightness 0-100 */
  light: number;
  /** Canvas shadowBlur in pixels (0 = no glow). */
  glow: number;
  /** When true, brightness should oscillate slightly over time. */
  pulse: boolean;
  /** Predicted multiplier for this barrier (rounded). */
  multiplier: number;
}

export function predictedMultiplier(
  barrierIndex: number,
  mode: "live" | "demo",
  demoBase: number,
): number {
  if (mode === "demo") {
    // Espelha o offset de aquecimento de `demoMultiplierFor`: as primeiras
    // DEMO_FREE_BARRIERS barreiras valem 0 (não pagam), então também não
    // devem mostrar etiqueta R$ nem cor de "premiada" no canvas.
    const effective = Math.max(0, Math.floor(barrierIndex) - DEMO_FREE_BARRIERS);
    return DEMO_PER_BARRIER_FACTOR * demoBase * effective;
  }
  return multiplierForBarriers(barrierIndex);
}

export function styleForMultiplier(m: number): BarrierVisualStyle {
  if (m <= 0) {
    // dead zone — neutral grey
    return { hue: 220, sat: 6, light: 38, glow: 0, pulse: false, multiplier: 0 };
  }
  if (m <= 0.5) {
    return { hue: 140, sat: 55, light: 50, glow: 4, pulse: false, multiplier: m };
  }
  if (m <= 1.5) {
    return { hue: 140, sat: 80, light: 55, glow: 8, pulse: false, multiplier: m };
  }
  if (m <= 5) {
    return { hue: 160, sat: 100, light: 58, glow: 14, pulse: false, multiplier: m };
  }
  if (m <= 20) {
    return { hue: 48, sat: 100, light: 60, glow: 22, pulse: true, multiplier: m };
  }
  return { hue: 320, sat: 100, light: 62, glow: 28, pulse: true, multiplier: m };
}

export function styleForBarrier(
  barrierIndex: number,
  mode: "live" | "demo",
  demoBase: number,
): BarrierVisualStyle {
  const m = predictedMultiplier(barrierIndex, mode, demoBase);
  return styleForMultiplier(m);
}
