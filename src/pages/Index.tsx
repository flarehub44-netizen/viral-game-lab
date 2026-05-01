import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AgeGateScreen } from "@/components/auth/AgeGateScreen";
import { GameCanvas } from "@/components/GameCanvas";
import { DepositScreen } from "@/components/economy/DepositScreen";
import { KycIdentityScreen } from "@/components/economy/KycIdentityScreen";
import { LobbyScreen } from "@/components/economy/LobbyScreen";
import { WalletScreen } from "@/components/economy/WalletScreen";
import { WithdrawScreen } from "@/components/economy/WithdrawScreen";
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
import { startDemoRound, settleDemoRound } from "@/game/economy/demoRound";
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
  cpf?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
};

type PixDepositRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  confirmed_at: string | null;
};

type PixWithdrawalRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  provider_ref: string | null;
};

type Screen =
  | "lobby"
  | "wallet"
  | "deposit"
  | "withdraw"
  | "kycIdentity"
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
  // Demo é a experiência padrão para visitantes não autenticados.
  // Só é desativado se o usuário escolheu explicitamente sair para Auth (flag "auth").
  try {
    return sessionStorage.getItem(PLAY_MODE_KEY) !== "auth";
  } catch {
    return true;
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
      sessionStorage.setItem(PLAY_MODE_KEY, "auth");
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
  const [pixDeposits, setPixDeposits] = useState<PixDepositRow[]>([]);
  const [pixWithdrawals, setPixWithdrawals] = useState<PixWithdrawalRow[]>([]);
  const [economyLoading, setEconomyLoading] = useState(false);
  const kycReturnRef = useRef<"deposit" | "withdraw" | null>(null);

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
      const [
        { data: w, error: wErr },
        { data: rounds, error: roundsErr },
        { data: deps, error: depsErr },
        { data: wds, error: wdsErr },
      ] = await Promise.all([
        supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
        supabase
          .from("game_rounds")
          .select("id,created_at,stake,result_multiplier,payout,net_result")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("pix_deposits")
          .select("id,amount,status,created_at,expires_at,confirmed_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("pix_withdrawals")
          .select("id,amount,status,created_at,provider_ref")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
      if (wErr || roundsErr || depsErr || wdsErr) {
        toast.error("Não foi possível atualizar a carteira agora.");
      }
      setWalletBalance(Number(w?.balance ?? 0));
      setRoundHistory(mapRoundRows(rounds ?? []));
      setPixDeposits(
        (deps ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id),
          amount: Number(r.amount),
          status: String(r.status),
          created_at: String(r.created_at),
          expires_at: r.expires_at != null ? String(r.expires_at) : null,
          confirmed_at: r.confirmed_at != null ? String(r.confirmed_at) : null,
        })),
      );
      setPixWithdrawals(
        (wds ?? []).map((r: Record<string, unknown>) => ({
          id: String(r.id),
          amount: Number(r.amount),
          status: String(r.status),
          created_at: String(r.created_at),
          provider_ref: r.provider_ref != null ? String(r.provider_ref) : null,
        })),
      );
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
    const { data, error } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) {
      toast.error("Não foi possível carregar seu perfil.");
      return;
    }
    setProfile(data as ProfileRow | null);
    if (data?.display_name) setNickname(data.display_name);
  }, [user]);

  const openDepositFlow = useCallback(() => {
    const p = profile;
    const cpfOk = typeof p?.cpf === "string" && p.cpf.replace(/\D/g, "").length === 11;
    const phoneOk = typeof p?.phone === "string" && p.phone.replace(/\D/g, "").length >= 10;
    if (!cpfOk || !phoneOk) {
      kycReturnRef.current = "deposit";
      setScreen("kycIdentity");
      return;
    }
    setScreen("deposit");
  }, [profile]);

  const openWithdrawFlow = useCallback(() => {
    const p = profile;
    const cpfOk = typeof p?.cpf === "string" && p.cpf.replace(/\D/g, "").length === 11;
    const phoneOk = typeof p?.phone === "string" && p.phone.replace(/\D/g, "").length >= 10;
    if (!cpfOk || !phoneOk) {
      kycReturnRef.current = "withdraw";
      setScreen("kycIdentity");
      return;
    }
    setScreen("withdraw");
  }, [profile]);

  const handleKycIdentitySaved = useCallback(async () => {
    await reloadProfile();
    const next = kycReturnRef.current;
    kycReturnRef.current = null;
    if (next === "deposit") setScreen("deposit");
    else if (next === "withdraw") setScreen("withdraw");
    else setScreen("wallet");
  }, [reloadProfile]);

  const handlePixDepositConfirmed = useCallback(async () => {
    await refreshEconomy();
  }, [refreshEconomy]);

  const handlePixWithdrawRequested = useCallback(async () => {
    await refreshEconomy();
  }, [refreshEconomy]);

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

  // Quando o usuário confirma o age gate em outra aba, refaz o profile ao voltar para esta.
  useEffect(() => {
    if (!user || profile?.over_18_confirmed_at) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadProfile();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, profile?.over_18_confirmed_at, reloadProfile]);

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
    const barriersPassed = summary.barriersPassed ?? 0;

    setActiveRound(null);
    setActiveLayout(null);
    activeRoundRef.current = null;

    const newBest = stats.score > bestScore;
    setIsNewBest(newBest);

    let finalEconomy: ServerEconomyPayload | null = null;

    if (settled) {
      if (isDemo) {
        const settledDemo = settleDemoRound(settled, barriersPassed);
        finalEconomy = {
          stake: settled.stake_amount,
          resultMultiplier: settled.result_multiplier,
          payout: settledDemo.payout,
          netResult: settledDemo.netResult,
          reachedTarget: settledDemo.reachedTarget,
          barriersPassed,
          targetBarrier: settled.target_barrier ?? 0,
        };
      } else {
        // Pré-popular com "perdeu" enquanto aguarda servidor
        finalEconomy = {
          stake: settled.stake_amount,
          resultMultiplier: settled.result_multiplier,
          payout: 0,
          netResult: -settled.stake_amount,
          reachedTarget: false,
          barriersPassed,
          targetBarrier: settled.target_barrier ?? 0,
        };
      }
    }
    setServerEconomy(finalEconomy);

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
            barriers_passed: barriersPassed,
          },
        });
        if (error || !data?.ok) {
          const errCode = (data as unknown as { error?: string } | null)?.error;
          console.error("end-round failed:", error ?? data);
          if (errCode === "layout_mismatch_seed" || errCode === "layout_mismatch_signature") {
            toast.error("Rodada cancelada: falha na verificação de integridade.");
          } else {
            toast.error("Falha ao fechar rodada no servidor.");
          }
        } else if (data.round_status === "rejected") {
          toast.error("Rodada cancelada: falha na verificação de integridade.");
        } else {
          // Atualiza com o resultado real do servidor
          setServerEconomy({
            stake: settled.stake_amount,
            resultMultiplier: data.result_multiplier,
            payout: data.payout_amount,
            netResult: data.net_result,
            reachedTarget: Boolean(data.reached_target),
            barriersPassed,
            targetBarrier: settled.target_barrier ?? 0,
          });
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
            round_id: settled?.round_id,
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
      const { error } = await supabase.rpc("set_profile_display_name", {
        p_display_name: trimmed,
      });
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
        <div className="relative w-full h-full neon-app-column">
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
        <div className="relative w-full h-full neon-app-column">
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
      <div className="relative w-full h-full neon-app-column">
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
            onDeposit={isDemo ? undefined : openDepositFlow}
            onWithdraw={isDemo ? undefined : openWithdrawFlow}
            pixDeposits={isDemo ? [] : pixDeposits}
            pixWithdrawals={isDemo ? [] : pixWithdrawals}
          />
        )}

        {screen === "kycIdentity" && !isDemo && (
          <KycIdentityScreen
            onBack={() => {
              kycReturnRef.current = null;
              setScreen("wallet");
            }}
            onSaved={handleKycIdentitySaved}
          />
        )}

        {screen === "deposit" && !isDemo && (
          <DepositScreen onBack={() => setScreen("wallet")} onConfirmed={handlePixDepositConfirmed} />
        )}

        {screen === "withdraw" && !isDemo && profile && (
          <WithdrawScreen
            walletBalance={walletBalance}
            kycApproved={profile.kyc_status === "approved"}
            over18={Boolean(profile.over_18_confirmed_at)}
            onBack={() => setScreen("wallet")}
            onRequested={handlePixWithdrawRequested}
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
            allowScriptTerminate={!isDemo}
            qaMode={isDemo ? "demo" : "live"}
            mode={isDemo ? "demo" : "live"}
            targetBarrier={isDemo ? undefined : activeRound.target_barrier}
            layoutPlan={isDemo ? null : activeLayout}
            onGameOver={handleGameOver}
            onExit={exitPlaying}
            stakeCredits={activeRound.stake_amount}
            targetMultiplier={isDemo ? undefined : activeRound.target_multiplier}
            resultMultiplier={isDemo ? undefined : activeRound.result_multiplier}
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

      <p className="fixed bottom-1 left-0 right-0 text-center text-[9px] text-muted-foreground pointer-events-none px-4 neon-app-column">
        {isDemo
          ? "Demo: sem dados de conta. Créditos fictícios."
          : "Jogue com responsabilidade. Proibido para menores de 18 anos."}
      </p>
    </main>
  );
};

export default Index;
