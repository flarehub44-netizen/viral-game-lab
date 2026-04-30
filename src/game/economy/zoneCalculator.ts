import { MULTIPLIER_TIERS } from "./multiplierTable";

export type ZoneDifficulty = "easy" | "medium" | "hard" | "very_hard" | "extreme";

export interface ClimbZone {
  index: number;
  name: string;
  minMultiplier: number;
  maxMultiplier: number;
  totalProbability: number;
  color: string;
  difficulty: ZoneDifficulty;
}

const ZONE_COLORS = [
  "hsl(140 90% 58%)",
  "hsl(190 90% 58%)",
  "hsl(50 100% 58%)",
  "hsl(28 100% 58%)",
  "hsl(45 100% 62%)",
] as const;

const ZONE_DIFFICULTY: ZoneDifficulty[] = [
  "easy",
  "medium",
  "hard",
  "very_hard",
  "extreme",
];

export function calculateZones(zoneCount = 5): ClimbZone[] {
  const sorted = [...MULTIPLIER_TIERS].sort((a, b) => a.multiplier - b.multiplier);
  const targetMass = 1 / zoneCount;
  const buckets: typeof sorted[] = Array.from({ length: zoneCount }, () => []);
  let bucket = 0;
  let acc = 0;
  for (const tier of sorted) {
    buckets[bucket].push(tier);
    acc += tier.probability;
    if (bucket < zoneCount - 1 && acc >= targetMass * (bucket + 1)) bucket += 1;
  }
  return buckets.map((tiers, i) => {
    const safe = tiers.length > 0 ? tiers : [sorted[Math.min(i, sorted.length - 1)]];
    return {
      index: i,
      name: `Zona ${i + 1}`,
      minMultiplier: safe[0].multiplier,
      maxMultiplier: safe[safe.length - 1].multiplier,
      totalProbability: safe.reduce((s, t) => s + t.probability, 0),
      color: ZONE_COLORS[i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
      difficulty: ZONE_DIFFICULTY[i] ?? "extreme",
    };
  });
}

export function getZoneForMultiplier(multiplier: number, zones = calculateZones()): ClimbZone {
  return (
    zones.find((z) => multiplier >= z.minMultiplier && multiplier <= z.maxMultiplier) ??
    zones[zones.length - 1]
  );
}
