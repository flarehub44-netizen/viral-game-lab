import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AgeGateScreen } from "@/components/auth/AgeGateScreen";
import { GameCanvas } from "@/components/GameCanvas";
import { LobbyScreen } from "@/components/economy/LobbyScreen";
import { WalletScreen } from "@/components/economy/WalletScreen";
import { RoundSetupScreen } from "@/components/economy/RoundSetupScreen";
import { RulesScreen } from "@/components/economy/RulesScreen";
import { GameOverScreen } from "@/components/GameOverScreen";
import { Leaderboard, invalidateLeaderboardCache } from "@/components/Leaderboard";
import { NicknameDialog } from "@/components/NicknameDialog";
import { MissionsPanel } from "@/components/MissionsPanel";
import { AchievementsPanel } from "@/components/AchievementsPanel";
import type { PublicGameStats, RoundSummaryOut } from "@/game/engine";
import type {
  ActiveServerRound,
  EndRoundResponse,
  RoundHistoryRow,
  ServerEconomyPayload,
  StartRoundResponse,
} from "@/game/economy/serverRound";
import { startDemoRound } from "@/game/economy/demoRound";
import { loadDemoHistory } from "@/game/economy/demoHistory";
import { loadWallet } from "@/game/economy/walletStore";
import { generateDeterministicLayout } from "@/game/economy/liveDeterministicLayout";
import { applyRound, type ProgressionProfile, type RoundResult } from "@/game/progression";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseExternal";
import { toast } from "sonner";

type ProfileRow = {
  user_id: string;
  display_name: string;
  over_18_confirmed_at: string | null;
  kyc_status: "none" | "pending" | "approved";
  created_at: string;
  updated_at: string;
};

type Screen =
  | "lobby"
  | "wallet"
  | "roundSetup"
  | "playing"
  | "over"
  | "leaderboard"
  | "missions"
  | "achievements"
  | "rules";

const PLAY_MODE_KEY = "ns_play_mode";
const DEMO_NICK_KEY = "ns_demo_nickname";

function readGuestDemoFlag(): boolean {
  try {
    return sessionStorage.getItem(PLAY_MODE_KEY) === "demo";
  } catch {
    return false;
  }
}

function mapRoundRows(rows: unknown): RoundHistoryRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      created_at: String(row.created_at),
      stake: Number(row.stake),
      result_multiplier: Number(row.result_multiplier),
      payout: Number(row.payout),
      net_result: Number(row.net_result),
    };
  });
}

const Index = () => {
  const { session, user, loading: authLoading } = useAuth();

  const [guestDemoActive, setGuestDemoActive] = useState(readGuestDemoFlag);

  const enterDemo = useCallback(() => {
    try {
      sessionStorage.setItem(PLAY_MODE_KEY, "demo");
    } catch {
      /* ignore */
    }
    setGuestDemoActive(true);
  }, []);

  const leaveDemoToAuth = useCallback(() => {
    try {
      sessionStorage.removeItem(PLAY_MODE_KEY);
    } catch {
      /* ignore */
    }
    setGuestDemoActive(false);
  }, []);

  useEffect(() => {
    if (user) {
      try {
        sessionStorage.removeItem(PLAY_MODE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [user]);

  const isOnline = Boolean(user && session);
  const isDemo = !user && guestDemoActive;
  const progressionProfile: ProgressionProfile = isDemo ? "demo" : "default";

  const [hydrating, setHydrating] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [roundHistory, setRoundHistory] = useState<RoundHistoryRow[]>([]);
  const [economyLoading, setEconomyLoading] = useState(false);

  const [screen, setScreen] = useState<Screen>("lobby");
  const [nickname, setNickname] = useState("");
  const [demoNickname, setDemoNickname] = useState(() => {
    try {
      return localStorage.getItem(DEMO_NICK_KEY)?.slice(0, 24) ?? "";
    } catch {
      return "";
    }
  });
  const [bestScore, setBestScore] = useState(0);

  const [lastStats, setLastStats] = useState<PublicGameStats | null>(null);
  const [lastSummary, setLastSummary] = useState<RoundSummaryOut | null>(null);
  const [lastProgression, setLastProgression] = useState<RoundResult | null>(null);
  const [serverEconomy, setServerEconomy] = useState<ServerEconomyPayload | null>(null);

  const [activeRound, setActiveRound] = useState<ActiveServerRound | null>(null);
  const [activeLayout, setActiveLayout] = useState<ReturnType<typeof generateDeterministicLayout> | null>(null);
  const activeRoundRef = useRef<ActiveServerRound | null>(null);
  const [startingRound, setStartingRound] = useState(false);

  const [isNewBest, setIsNewBest] = useState(false);
  const [savingScore, setSavingScore] = useState(false);
  const [showNickDialog, setShowNickDialog] = useState(false);
  const settledRoundsRef = useRef<Set<string>>(new Set());

  const bestKey = useMemo(() => {
    if (isDemo) return "ns_best_demo";
    return user?.id ? `ns_best_${user.id}` : "ns_best_guest";
  }, [isDemo, user?.id]);

  useEffect(() => {
    try {
      setBestScore(Number(localStorage.getItem(bestKey) || 0));
    } catch {
      setBestScore(0);
    }
  }, [bestKey]);

  const refreshEconomy = useCallback(async () => {
    if (!user) return;
    setEconomyLoading(true);
    try {
      const [{ data: w }, { data: rounds }] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
        supabase
          .from("game_rounds")
          .select("id,created_at,stake,result_multiplier,payout,net_result")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      setWalletBalance(Number(w?.balance ?? 0));
      setRoundHistory(mapRoundRows(rounds ?? []));
    } finally {
      setEconomyLoading(false);
    }
  }, [user]);

  const refreshDemoEconomy = useCallback(() => {
    setWalletBalance(loadWallet().balance);
    setRoundHistory(loadDemoHistory());
  }, []);

  useEffect(() => {
    if (isDemo) {
      refreshDemoEconomy();
    }
  }, [isDemo, refreshDemoEconomy]);

  const reloadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    setProfile(data as ProfileRow | null);
    if (data?.display_name) setNickname(data.display_name);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      if (!isDemo) {
        setHydrating(false);
        setWalletBalance(0);
        setRoundHistory([]);
      }
      setActiveRound(null);
      activeRoundRef.current = null;
      return;
    }
    let cancelled = false;
    setHydrating(true);
    (async () => {
      await reloadProfile();
      await refreshEconomy();
      if (!cancelled) setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, reloadProfile, refreshEconomy, isDemo]);

  const displayNickname = isDemo
    ? demoNickname.trim() || "Jogador demo"
    : nickname.trim() || profile?.display_name?.trim() || "Player";

  const openRoundSetup = () => {
    setLastStats(null);
    setLastSummary(null);
    setLastProgression(null);
    setServerEconomy(null);
    setIsNewBest(false);
    setScreen("roundSetup");
  };

  const exitPlaying = () => {
    const settled = activeRoundRef.current;
    setActiveRound(null);
    activeRoundRef.current = null;
    setActiveLayout(null);
    setScreen("lobby");
    if (isDemo) {
      refreshDemoEconomy();
      toast.message("Rodada já contabilizada na carteira demo.");
    } else {
      if (settled?.round_id && !settledRoundsRef.current.has(settled.round_id)) {
        settledRoundsRef.current.add(settled.round_id);
        if (settled.layout_seed && settled.layout_signature) {
          void supabase.functions.invoke<EndRoundResponse>("end-round", {
            body: {
              round_id: settled.round_id,
              alive: 1,
              layout_seed: settled.layout_seed,
              layout_signature: settled.layout_signature,
              barriers_passed: 0,
            },
          });
        }
      }
      void refreshEconomy();
      toast.message("Rodada já foi contabilizada no servidor.");
    }
  };

  const confirmStakeAndPlay = async (stake: number, targetMultiplier: number) => {
    if (isDemo) {
      setStartingRound(true);
      try {
        const res = startDemoRound(stake, targetMultiplier);
        if (!res.ok) {
          const err = res as { ok: false; error: string };
          if (err.error === "insufficient_balance") toast.error("Saldo insuficiente.");
          else toast.error("Valor de entrada inválido.");
          return;
        }
        activeRoundRef.current = res.round;
        setActiveRound(res.round);
        refreshDemoEconomy();
        setScreen("playing");
      } finally {
        setStartingRound(false);
      }
      return;
    }

    if (!session?.access_token) {
      toast.error("Sessão inválida. Entre novamente.");
      return;
    }
    setStartingRound(true);
    try {
      const idempotency_key = crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke("start-round", {
        body: {
          stake_amount: stake,
          mode: "target_20x",
          idempotency_key,
        },
      });

      if (error) throw error;

      const payload = data as StartRoundResponse & { error?: string };
      if (!payload?.ok) {
        const code = payload?.error ?? "round_failed";
        if (code === "age_required") toast.error("Confirme que você tem 18+ antes de jogar.");
        else if (code === "insufficient_balance") toast.error("Saldo insuficiente.");
        else toast.error("Não foi possível iniciar a rodada.");
        return;
      }

      const roundPayload = payload as ActiveServerRound;
      if (roundPayload.layout_seed && roundPayload.target_barrier) {
        setActiveLayout(
          generateDeterministicLayout(
            roundPayload.layout_seed,
            roundPayload.target_barrier,
          ),
        );
      } else {
        setActiveLayout(null);
      }
      activeRoundRef.current = roundPayload;
      setActiveRound(roundPayload);
      await refreshEconomy();
      setScreen("playing");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar rodada");
    } finally {
      setStartingRound(false);
    }
  };

  const handleGameOver = async (stats: PublicGameStats, summary: RoundSummaryOut) => {
    setLastStats(stats);
    setLastSummary(summary);

    const settled = activeRoundRef.current;
    if (settled) {
      setServerEconomy({
        stake: settled.stake_amount,
        resultMultiplier: settled.result_multiplier,
        payout: settled.payout_amount,
        netResult: settled.net_result,
      });
    } else {
      setServerEconomy(null);
    }

    setActiveRound(null);
    setActiveLayout(null);
    activeRoundRef.current = null;

    const newBest = stats.score > bestScore;
    setIsNewBest(newBest);

    const result = applyRound(
      {
        score: summary.score,
        durationSeconds: summary.durationSeconds,
        maxCombo: summary.maxCombo,
        maxAlive: summary.maxAlive,
        splits: summary.splits,
        powerupsCollected: summary.powerupsCollected,
        barriersPassed: summary.barriersPassed,
        finalMultiplier: settled?.result_multiplier ?? stats.currentMultiplier,
        finalZone: stats.currentZone,
      },
      progressionProfile,
    );
    setLastProgression(result);

    setScreen("over");

    if (isDemo) {
      refreshDemoEconomy();
    } else {
      if (
        settled?.round_id &&
        settled.layout_seed &&
        settled.layout_signature &&
        !settledRoundsRef.current.has(settled.round_id)
      ) {
        settledRoundsRef.current.add(settled.round_id);
        const { data, error } = await supabase.functions.invoke<EndRoundResponse>("end-round", {
          body: {
            round_id: settled.round_id,
            alive: stats.alive,
            layout_seed: settled.layout_seed,
            layout_signature: settled.layout_signature,
            barriers_passed: summary.barriersPassed ?? 0,
          },
        });
        if (error || !data?.ok) {
          console.error("end-round failed:", error ?? data);
          toast.error("Falha ao fechar rodada no servidor.");
        }
      }
      await refreshEconomy();
    }

    if (!isDemo && newBest && stats.score > 0) {
      setBestScore(stats.score);
      try {
        localStorage.setItem(bestKey, String(stats.score));
      } catch {
        /* ignore */
      }

      setSavingScore(true);
      try {
        const { data, error } = await supabase.functions.invoke("submit-score", {
          body: {
            nickname: displayNickname.slice(0, 20),
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
    } else if (newBest && stats.score > 0) {
      setBestScore(stats.score);
      try {
        localStorage.setItem(bestKey, String(stats.score));
      } catch {
        /* ignore */
      }
    }
  };

  const handleSaveNick = async (name: string) => {
    const trimmed = name.trim().slice(0, 24);
    setShowNickDialog(false);
    if (isDemo) {
      setDemoNickname(trimmed);
      try {
        localStorage.setItem(DEMO_NICK_KEY, trimmed);
      } catch {
        /* ignore */
      }
      return;
    }
    setNickname(trimmed);
    if (user && trimmed) {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("user_id", user.id);
      if (error) toast.error("Não foi possível atualizar o apelido.");
      else await reloadProfile();
    }
  };

  const handleRetry = () => {
    setServerEconomy(null);
    openRoundSetup();
  };

  if (authLoading) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-background text-muted-foreground text-sm">
        Carregando sessão...
      </main>
    );
  }

  if (!isOnline && !isDemo) {
    return (
      <main className="fixed inset-0 w-full h-full overflow-hidden bg-background">
        <div className="relative w-full h-full max-w-md mx-auto">
          <AuthScreen onPlayDemo={enterDemo} />
        </div>
      </main>
    );
  }

  if (isOnline && hydrating) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-background text-muted-foreground text-sm">
        Carregando perfil...
      </main>
    );
  }

  if (isOnline && profile && !profile.over_18_confirmed_at) {
    return (
      <main className="fixed inset-0 w-full h-full overflow-hidden bg-background">
        <div className="relative w-full h-full max-w-md mx-auto">
          <AgeGateScreen onConfirmed={() => void reloadProfile()} />
        </div>
      </main>
    );
  }

  const economySourceUi = isDemo ? "demo" : "server";

  return (
    <main
      className="fixed inset-0 w-full h-full overflow-hidden bg-background"
      style={{ touchAction: "manipulation" }}
    >
      <div className="relative w-full h-full max-w-md mx-auto">
        {screen === "lobby" && (
          <LobbyScreen
            walletBalance={walletBalance}
            nickname={displayNickname}
            bestScore={bestScore}
            onPlay={openRoundSetup}
            onWallet={() => setScreen("wallet")}
            onHistory={() => setScreen("wallet")}
            onRules={() => setScreen("rules")}
            onChangeName={() => setShowNickDialog(true)}
            onLeaderboard={() => setScreen("leaderboard")}
            onMissions={() => setScreen("missions")}
            onAchievements={() => setScreen("achievements")}
            playMode={isDemo ? "demo" : "online"}
            progressionProfile={progressionProfile}
            onSignIn={isDemo ? leaveDemoToAuth : undefined}
          />
        )}

        {screen === "wallet" && (
          <WalletScreen
            balance={walletBalance}
            history={roundHistory}
            loading={!isDemo && economyLoading}
            onBack={() => setScreen("lobby")}
            variant={isDemo ? "demo" : "online"}
          />
        )}

        {screen === "rules" && <RulesScreen onBack={() => setScreen("lobby")} />}

        {screen === "roundSetup" && (
          <RoundSetupScreen
            balance={walletBalance}
            busy={startingRound}
            onBack={() => setScreen("lobby")}
            onConfirm={confirmStakeAndPlay}
            economySource={economySourceUi}
          />
        )}

        {screen === "playing" && activeRound && (
          <GameCanvas
            roundId={activeRound.round_id}
            visualScript={isDemo ? null : activeRound.visual_result}
            allowScriptTerminate={false}
            qaMode={isDemo ? "demo" : "live"}
            mode={isDemo ? "demo" : "live"}
            targetBarrier={activeRound.target_barrier}
            layoutPlan={isDemo ? null : activeLayout}
            onGameOver={handleGameOver}
            onExit={exitPlaying}
            stakeCredits={activeRound.stake_amount}
            targetMultiplier={activeRound.target_multiplier}
            resultMultiplier={activeRound.result_multiplier}
          />
        )}

        {screen === "over" && lastStats && (
          <GameOverScreen
            stats={lastStats}
            isNewBest={isNewBest}
            bestScore={bestScore}
            onRetry={handleRetry}
            onMenu={() => setScreen("lobby")}
            onLeaderboard={() => setScreen("leaderboard")}
            saving={!isDemo && savingScore}
            progression={lastProgression}
            maxCombo={lastSummary?.maxCombo ?? 0}
            serverEconomy={serverEconomy}
            economySource={economySourceUi}
            onChangeStake={handleRetry}
            onOpenHistory={() => setScreen("wallet")}
            climbZone={lastStats.currentZone}
            climbMultiplier={lastStats.currentMultiplier}
            barriersPassed={lastSummary?.barriersPassed}
          />
        )}

        {screen === "leaderboard" && (
          <Leaderboard onBack={() => setScreen("lobby")} highlightNickname={displayNickname} />
        )}

        {screen === "missions" && (
          <MissionsPanel onBack={() => setScreen("lobby")} progressionProfile={progressionProfile} />
        )}
        {screen === "achievements" && (
          <AchievementsPanel onBack={() => setScreen("lobby")} progressionProfile={progressionProfile} />
        )}

        {showNickDialog && (
          <NicknameDialog
            current={displayNickname}
            onSave={handleSaveNick}
            onCancel={() => setShowNickDialog(false)}
          />
        )}
      </div>

      <p className="fixed bottom-1 left-0 right-0 text-center text-[9px] text-muted-foreground pointer-events-none px-4 max-w-md mx-auto">
        {isDemo
          ? "Demo: sem dados de conta. Créditos fictícios."
          : "Jogue com responsabilidade. Proibido para menores de 18 anos."}
      </p>
    </main>
  );
};

export default Index;
