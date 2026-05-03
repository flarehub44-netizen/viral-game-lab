import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, RotateCcw } from "lucide-react";
import { GameCanvas } from "@/components/GameCanvas";
import type { PublicGameStats, RoundSummaryOut } from "@/game/engine";

const BEST_KEY = "ns_best_arcade";

type Phase = "idle" | "playing" | "over";

interface FinalStats {
  score: number;
  barriersPassed: number;
  combo: number;
  durationSeconds: number;
}

const readBest = (): number => {
  try {
    const v = Number(localStorage.getItem(BEST_KEY) ?? "0");
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
};

export const AdminArcade = () => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [roundId, setRoundId] = useState(() => `arcade-${Date.now()}`);
  const [best, setBest] = useState<number>(0);
  const [last, setLast] = useState<FinalStats | null>(null);

  useEffect(() => {
    setBest(readBest());
  }, []);

  const startGame = () => {
    setRoundId(`arcade-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    setLast(null);
    setPhase("playing");
  };

  const handleGameOver = (stats: PublicGameStats, _summary: RoundSummaryOut) => {
    const final: FinalStats = {
      score: stats.score,
      barriersPassed: stats.barriersPassed ?? 0,
      combo: stats.combo,
      durationSeconds: stats.durationSeconds,
    };
    setLast(final);
    if (final.score > best) {
      try {
        localStorage.setItem(BEST_KEY, String(final.score));
      } catch {
        /* noop */
      }
      setBest(final.score);
    }
    setPhase("over");
  };

  if (phase === "playing") {
    return (
      <main className="fixed inset-0 bg-background">
        <div className="relative w-full h-full max-w-[420px] mx-auto">
          <GameCanvas
            roundId={roundId}
            visualScript={null}
            mode="demo"
            stakeCredits={0}
            onGameOver={handleGameOver}
            onExit={() => setPhase("idle")}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link
            to="/admin/overview"
            className="inline-flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} /> Admin
          </Link>
          <span className="text-[10px] font-black uppercase tracking-widest text-[hsl(280_90%_75%)]">
            Arcade
          </span>
        </div>

        <header className="text-center mt-4">
          <h1 className="text-3xl font-black uppercase tracking-tight text-glow-cyan">
            Modo Pontos
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Jogue livremente. Sem apostas, sem dinheiro — apenas pontuação.
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card/60 backdrop-blur p-5 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Melhor pontuação
          </div>
          <div className="text-4xl font-black tabular-nums text-glow-magenta mt-1">
            {best.toLocaleString("pt-BR")}
          </div>
        </section>

        {phase === "over" && last && (
          <section className="rounded-xl border border-border bg-card/40 p-4 grid grid-cols-2 gap-3 text-center">
            <Stat label="Score" value={last.score.toLocaleString("pt-BR")} />
            <Stat label="Barreiras" value={String(last.barriersPassed)} />
            <Stat label="Combo máx" value={`×${last.combo}`} />
            <Stat label="Duração" value={`${last.durationSeconds.toFixed(1)}s`} />
          </section>
        )}

        <button
          onClick={startGame}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(280_70%_50%)] bg-[hsl(280_35%_18%)] text-[hsl(280_90%_85%)] py-4 text-sm font-black uppercase tracking-widest hover:bg-[hsl(280_40%_22%)] transition-colors"
        >
          {phase === "over" ? <RotateCcw size={16} /> : <Play size={16} />}
          {phase === "over" ? "Jogar de novo" : "Jogar"}
        </button>
      </div>
    </main>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="text-lg font-bold tabular-nums mt-0.5">{value}</div>
  </div>
);

export default AdminArcade;
