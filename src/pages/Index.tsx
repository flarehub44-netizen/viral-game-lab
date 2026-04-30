import { useState } from "react";
import { GameCanvas } from "@/components/GameCanvas";
import { StartScreen } from "@/components/StartScreen";
import { GameOverScreen } from "@/components/GameOverScreen";
import { Leaderboard, invalidateLeaderboardCache } from "@/components/Leaderboard";
import { NicknameDialog } from "@/components/NicknameDialog";
import type { PublicGameStats } from "@/game/engine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      const stored = localStorage.getItem(NICK_KEY);
      if (stored) return stored;
    } catch {}
    const n = randomNick();
    try {
      localStorage.setItem(NICK_KEY, n);
    } catch {}
    return n;
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

  const handlePlay = () => {
    setLastStats(null);
    setIsNewBest(false);
    setScreen("playing");
  };

  const handleGameOver = async (stats: PublicGameStats) => {
    setLastStats(stats);
    const newBest = stats.score > bestScore;
    setIsNewBest(newBest);
    setScreen("over");

    if (newBest && stats.score > 0) {
      setBestScore(stats.score);
      try {
        localStorage.setItem(BEST_KEY, String(stats.score));
      } catch {}

      // Only persist personal records to keep backend load low
      setSavingScore(true);
      try {
        const { data, error } = await supabase.functions.invoke("submit-score", {
          body: {
            nickname,
            score: stats.score,
            duration_seconds: stats.durationSeconds,
          },
        });
        if (error) throw error;
        if (!data?.ok) throw new Error("Save failed");
        invalidateLeaderboardCache();
      } catch (e) {
        console.error("Submit score failed:", e);
        toast.error("Não foi possível salvar no ranking");
      } finally {
        setSavingScore(false);
      }
    }
  };

  const handleSaveNick = (name: string) => {
    setNickname(name);
    try {
      localStorage.setItem(NICK_KEY, name);
    } catch {}
    setShowNickDialog(false);
  };

  return (
    <main
      className="fixed inset-0 w-full h-full overflow-hidden bg-background"
      style={{ touchAction: "manipulation" }}
    >
      <div className="relative w-full h-full max-w-md mx-auto">
        {screen === "menu" && (
          <StartScreen
            bestScore={bestScore}
            nickname={nickname}
            onPlay={handlePlay}
            onChangeName={() => setShowNickDialog(true)}
            onLeaderboard={() => setScreen("leaderboard")}
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
            bestScore={bestScore}
            onRetry={handlePlay}
            onMenu={() => setScreen("menu")}
            onLeaderboard={() => setScreen("leaderboard")}
            saving={savingScore}
          />
        )}

        {screen === "leaderboard" && (
          <Leaderboard
            onBack={() => setScreen("menu")}
            highlightNickname={nickname}
          />
        )}

        {showNickDialog && (
          <NicknameDialog
            current={nickname}
            onSave={handleSaveNick}
            onCancel={() => setShowNickDialog(false)}
          />
        )}
      </div>
    </main>
  );
};

export default Index;
