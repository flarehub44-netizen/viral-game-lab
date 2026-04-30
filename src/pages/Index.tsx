import { useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@/components/GameCanvas";
import { StartScreen } from "@/components/StartScreen";
import { GameOverScreen } from "@/components/GameOverScreen";
import { Leaderboard } from "@/components/Leaderboard";
import { NicknameDialog } from "@/components/NicknameDialog";
import type { PublicGameStats } from "@/game/engine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { applyRunToMissions, type Mission } from "@/game/missions";
import { addLifetimeScore } from "@/game/skins";

type Screen = "menu" | "playing" | "over" | "leaderboard";

const NICK_KEY = "ns_nickname";
const BEST_KEY = "ns_best";

function randomNick() {
  const n = Math.floor(Math.random() * 9000 + 1000);
  return `Player${n}`;
}

const Index = () => {
  const [screen, setScreen] = useState<Screen>("menu");
  const [nickname, setNickname] = useState<string>(() => {
    try {
      return localStorage.getItem(NICK_KEY) || randomNick();
    } catch {
      return randomNick();
    }
  });
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(BEST_KEY) || 0);
    } catch {
      return 0;
    }
  });
  const [lastStats, setLastStats] = useState<PublicGameStats | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [showNickDialog, setShowNickDialog] = useState(false);
  const [newlyCompletedMissions, setNewlyCompletedMissions] = useState<Mission[]>([]);

  // Persist nickname
  useEffect(() => {
    try {
      localStorage.setItem(NICK_KEY, nickname);
    } catch {}
  }, [nickname]);

  // Parse ?challenge= from URL
  const challenge = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    const c = Number(p.get("challenge"));
    return Number.isFinite(c) && c > 0 ? { score: c } : null;
  }, []);

  const handlePlay = () => {
    setLastStats(null);
    setIsNewBest(false);
    setScreen("playing");
  };

  const handleGameOver = async (stats: PublicGameStats) => {
    setLastStats(stats);
    const newBest = stats.score > bestScore;
    setIsNewBest(newBest);
    if (newBest) {
      setBestScore(stats.score);
      try {
        localStorage.setItem(BEST_KEY, String(stats.score));
      } catch {}
    }

    // Lifetime score (desbloqueia skins)
    addLifetimeScore(stats.score);

    // Atualiza missões diárias
    const completed = applyRunToMissions({
      score: stats.score,
      maxMultiplier: stats.maxMultiplier,
      durationSeconds: stats.durationSeconds,
      bestPerfectStreak: stats.bestPerfectStreak,
      nearMisses: stats.nearMisses,
      pickedAnyPowerup: stats.pickedAnyPowerup,
    });
    setNewlyCompletedMissions(completed);

    setScreen("over");

    // Submit to leaderboard if score is meaningful
    if (stats.score > 0) {
      setSavingScore(true);
      try {
        const { data, error } = await supabase.functions.invoke("submit-score", {
          body: {
            nickname,
            score: stats.score,
            max_multiplier: stats.maxMultiplier,
            duration_seconds: stats.durationSeconds,
          },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error("Save failed");
      } catch (e) {
        console.error("Submit score failed:", e);
        toast.error("Não foi possível salvar no ranking");
      } finally {
        setSavingScore(false);
      }
    }
  };

  return (
    <main
      className="fixed inset-0 w-full h-full overflow-hidden bg-background"
      style={{ touchAction: "manipulation" }}
    >
      {/* Vertical-friendly container */}
      <div className="relative w-full h-full max-w-md mx-auto">
        {screen === "menu" && (
          <StartScreen
            bestScore={bestScore}
            nickname={nickname}
            onPlay={handlePlay}
            onChangeName={() => setShowNickDialog(true)}
            onLeaderboard={() => setScreen("leaderboard")}
            challenge={challenge}
          />
        )}

        {screen === "playing" && (
          <GameCanvas
            onGameOver={handleGameOver}
            onExit={() => setScreen("menu")}
          />
        )}

        {screen === "over" && lastStats && (
          <GameOverScreen
            stats={lastStats}
            isNewBest={isNewBest}
            nickname={nickname}
            onRetry={handlePlay}
            onMenu={() => setScreen("menu")}
            onLeaderboard={() => setScreen("leaderboard")}
            saving={savingScore}
            newlyCompletedMissions={newlyCompletedMissions}
          />
        )}

        {screen === "leaderboard" && (
          <Leaderboard
            onBack={() =>
              setScreen(lastStats && screen === "leaderboard" ? "over" : "menu")
            }
            highlightNickname={nickname}
          />
        )}

        {showNickDialog && (
          <NicknameDialog
            current={nickname}
            onSave={(name) => {
              setNickname(name);
              setShowNickDialog(false);
            }}
            onCancel={() => setShowNickDialog(false)}
          />
        )}
      </div>
    </main>
  );
};

export default Index;
