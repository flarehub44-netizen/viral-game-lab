import { useEffect, useMemo, useState } from "react";
import { GameCanvas } from "@/components/GameCanvas";
import { StartScreen } from "@/components/StartScreen";
import { GameOverScreen } from "@/components/GameOverScreen";
import { Leaderboard } from "@/components/Leaderboard";
import { NicknameDialog } from "@/components/NicknameDialog";
import { AchievementsScreen } from "@/components/AchievementsScreen";
import { SettingsScreen } from "@/components/SettingsScreen";
import { DailyChallengeScreen } from "@/components/DailyChallengeScreen";
import type { PublicGameStats } from "@/game/engine";
import { GameEngine } from "@/game/engine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { applyRunToMissions, type Mission } from "@/game/missions";
import { addLifetimeScore } from "@/game/skins";
import { addXpFromScore } from "@/game/progression";
import { applyRun as applyAchievements, type Achievement } from "@/game/achievements";
import { getDailyDateKey, markPlayedToday, setLocalBest } from "@/game/daily";
import { sfx, hapticPatterns, haptic } from "@/game/audio";
import { getSettings } from "@/game/settings";

type Screen = "menu" | "playing" | "over" | "leaderboard" | "achievements" | "settings" | "daily";

const NICK_KEY = "ns_nickname";
const BEST_KEY = "ns_best";

function randomNick() {
  const n = Math.floor(Math.random() * 9000 + 1000);
  return `Player${n}`;
}

const Index = () => {
  const [screen, setScreen] = useState<Screen>("menu");
  const [dailyMode, setDailyMode] = useState(false);
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

  // Init colorblind setting global
  useEffect(() => {
    GameEngine.colorblindEnabled = getSettings().colorblind;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NICK_KEY, nickname);
    } catch {}
  }, [nickname]);

  const challenge = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    const c = Number(p.get("challenge"));
    return Number.isFinite(c) && c > 0 ? { score: c } : null;
  }, []);

  const handlePlay = () => {
    setLastStats(null);
    setIsNewBest(false);
    setDailyMode(false);
    setScreen("playing");
  };

  const handlePlayDaily = () => {
    setLastStats(null);
    setIsNewBest(false);
    setDailyMode(true);
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

    addLifetimeScore(stats.score);

    // XP / level-up
    const xpResult = addXpFromScore(stats.score);
    if (xpResult.leveledUp) {
      sfx.achievement();
      haptic(hapticPatterns.levelUp);
      toast.success(`Nível ${xpResult.info.level}!`, {
        description: "Você subiu de nível 🎉",
      });
    }

    // Missions
    const completedMissions = applyRunToMissions({
      score: stats.score,
      maxMultiplier: stats.maxMultiplier,
      durationSeconds: stats.durationSeconds,
      bestPerfectStreak: stats.bestPerfectStreak,
      nearMisses: stats.nearMisses,
      pickedAnyPowerup: stats.pickedAnyPowerup,
    });
    setNewlyCompletedMissions(completedMissions);

    // Achievements
    const newlyUnlocked: Achievement[] = applyAchievements(
      {
        score: stats.score,
        maxMultiplier: stats.maxMultiplier,
        durationSeconds: stats.durationSeconds,
        bestPerfectStreak: stats.bestPerfectStreak,
        nearMisses: stats.nearMisses,
        pickedAnyPowerup: stats.pickedAnyPowerup,
      },
      { bossesKilled: stats.bossesKilled, mergesUsed: stats.mergesUsed },
    );
    if (newlyUnlocked.length > 0) {
      sfx.achievement();
      haptic(hapticPatterns.achievement);
      newlyUnlocked.forEach((a, i) => {
        setTimeout(() => {
          toast.success(`${a.icon} ${a.name}`, { description: a.description });
        }, i * 600);
      });
    }

    setScreen("over");

    // Persist score
    if (stats.score > 0) {
      setSavingScore(true);
      try {
        if (dailyMode) {
          setLocalBest(stats.score);
          markPlayedToday();
          const { data, error } = await supabase.functions.invoke("submit-daily-score", {
            body: {
              nickname,
              date_key: getDailyDateKey(),
              score: stats.score,
              max_multiplier: stats.maxMultiplier,
              duration_seconds: stats.durationSeconds,
            },
          });
          if (error) throw error;
          if (!data?.ok) throw new Error("Save failed");
        } else {
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
        }
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
      <div className="relative w-full h-full max-w-md mx-auto">
        {screen === "menu" && (
          <StartScreen
            bestScore={bestScore}
            nickname={nickname}
            onPlay={handlePlay}
            onChangeName={() => setShowNickDialog(true)}
            onLeaderboard={() => setScreen("leaderboard")}
            onAchievements={() => setScreen("achievements")}
            onSettings={() => setScreen("settings")}
            onDaily={() => setScreen("daily")}
            challenge={challenge}
          />
        )}

        {screen === "playing" && (
          <GameCanvas
            onGameOver={handleGameOver}
            onExit={() => setScreen("menu")}
            dailyMode={dailyMode}
          />
        )}

        {screen === "over" && lastStats && (
          <GameOverScreen
            stats={lastStats}
            isNewBest={isNewBest}
            nickname={nickname}
            onRetry={dailyMode ? handlePlayDaily : handlePlay}
            onMenu={() => setScreen("menu")}
            onLeaderboard={() => setScreen(dailyMode ? "daily" : "leaderboard")}
            saving={savingScore}
            newlyCompletedMissions={newlyCompletedMissions}
          />
        )}

        {screen === "leaderboard" && (
          <Leaderboard
            onBack={() => setScreen("menu")}
            highlightNickname={nickname}
          />
        )}

        {screen === "achievements" && (
          <AchievementsScreen onBack={() => setScreen("menu")} />
        )}

        {screen === "settings" && (
          <SettingsScreen onBack={() => setScreen("menu")} />
        )}

        {screen === "daily" && (
          <DailyChallengeScreen
            onBack={() => setScreen("menu")}
            onPlayDaily={handlePlayDaily}
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
