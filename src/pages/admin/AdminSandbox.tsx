import { useState } from "react";

import { GameCanvas } from "@/components/GameCanvas";
import { GameOverScreen } from "@/components/GameOverScreen";
import { RoundSetupScreen } from "@/components/economy/RoundSetupScreen";
import type { PublicGameStats, RoundSummaryOut } from "@/game/engine";
import type { ServerEconomyPayload } from "@/game/economy/serverRound";
import {
  DEMO_DEFAULT_BASE,
  DEMO_FREE_BARRIERS,
  DEMO_MULTIPLIER_PER_BARRIER_FACTOR,
} from "@/game/economy/demoRound";

import { applyRound, type RoundResult } from "@/game/progression";

/**
 * Sandbox = cópia 1:1 do jogo demo, mas com uma carteira fictícia em memória
 * (R$ 1.000) que não toca a carteira real nem o backend. Jogo livre, sem
 * scripting do servidor, sem ferramentas de força de resultado.
 *
 * Fórmula de pagamento idêntica ao demo:
 *   multiplicador = 0,05 × base × barreiras
 *   payout        = entrada × multiplicador (capado em MAX_ROUND_PAYOUT)
 */

const SANDBOX_INITIAL_BALANCE = 1000;

interface ActiveSandboxRound {
  roundId: string;
  stake: number;
  base: number;
}

interface OverState {
  stats: PublicGameStats;
  summary: RoundSummaryOut;
  economy: ServerEconomyPayload;
  progression: RoundResult | null;
}

export const AdminSandbox = () => {
  const [fakeBalance, setFakeBalance] = useState(SANDBOX_INITIAL_BALANCE);
  const [activeRound, setActiveRound] = useState<ActiveSandboxRound | null>(null);
  const [over, setOver] = useState<OverState | null>(null);

  const startPlay = (stake: number, base: number) => {
    if (stake <= 0 || stake > fakeBalance) return;
    setOver(null);
    setFakeBalance((b) => Math.round((b - stake) * 100) / 100);
    setActiveRound({
      roundId: crypto.randomUUID(),
      stake,
      base,
    });
  };

  const handleGameOver = (
    round: ActiveSandboxRound,
    stats: PublicGameStats,
    summary: RoundSummaryOut,
  ) => {
    const barriers = summary.barriersPassed ?? 0;
    const effective = Math.max(0, barriers - DEMO_FREE_BARRIERS);
    const multiplier = DEMO_MULTIPLIER_PER_BARRIER_FACTOR * round.base * effective;
    // Sandbox não aplica teto MAX_ROUND_PAYOUT — créditos fictícios.
    const payout = Math.round(round.stake * multiplier * 100) / 100;
    const netResult = Math.round((payout - round.stake) * 100) / 100;

    setFakeBalance((b) => Math.round((b + payout) * 100) / 100);

    const economy: ServerEconomyPayload = {
      stake: round.stake,
      resultMultiplier: multiplier,
      payout,
      netResult,
      reachedTarget: payout > 0,
      barriersPassed: barriers,
      targetBarrier: 0,
      mode: "demo",
    };

    const progression = applyRound(
      {
        score: summary.score,
        durationSeconds: summary.durationSeconds,
        maxCombo: summary.maxCombo,
        maxAlive: summary.maxAlive,
        splits: summary.splits,
        powerupsCollected: summary.powerupsCollected,
        barriersPassed: barriers,
        finalMultiplier: multiplier,
      },
      "demo",
    );

    setOver({ stats, summary, economy, progression });
    setActiveRound(null);
  };

  // ============== Tela de fim de jogo ==============
  if (over && !activeRound) {
    return (
      <div className="absolute inset-0 z-50 bg-background overflow-y-auto">
        <GameOverScreen
          stats={over.stats}
          isNewBest={false}
          bestScore={over.stats.score}
          onRetry={() => setOver(null)}
          onMenu={() => setOver(null)}
          onLeaderboard={() => setOver(null)}
          progression={over.progression}
          maxCombo={over.summary.maxCombo}
          serverEconomy={over.economy}
          economySource="demo"
          onChangeStake={() => setOver(null)}
          barriersPassed={over.summary.barriersPassed}
        />
      </div>
    );
  }

  // ============== Tela de jogo ativo ==============
  if (activeRound) {
    return (
      <div className="absolute inset-0 z-50 bg-background">
        <GameCanvas
          roundId={activeRound.roundId}
          visualScript={null}
          allowScriptTerminate={false}
          qaMode="demo"
          mode="demo"
          onGameOver={(stats, summary) => handleGameOver(activeRound, stats, summary)}
          onExit={() => {
            setActiveRound(null);
          }}
          stakeCredits={activeRound.stake}
          targetMultiplier={activeRound.base}
        />
      </div>
    );
  }

  // ============== Setup pré-jogo ==============
  return (
    <div className="relative min-h-[calc(100vh-44px)] bg-background">
      <RoundSetupScreen
        balance={fakeBalance}
        onBack={() => window.history.back()}
        onConfirm={(stake, _meta) => startPlay(stake, DEMO_DEFAULT_BASE)}
        economySource="demo"
      />
    </div>
  );
};

export default AdminSandbox;
