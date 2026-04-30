import { Trophy, Target, Award, Play, Wallet, Users, ScrollText, BookOpen, LogIn, Flame } from "lucide-react";
import { levelFromXp, loadProgression, type ProgressionProfile } from "@/game/progression";

interface Props {
  walletBalance: number;
  nickname: string;
  bestScore: number;
  onPlay: () => void;
  onWallet: () => void;
  onHistory: () => void;
  onRules: () => void;
  onChangeName: () => void;
  onLeaderboard: () => void;
  onMissions: () => void;
  onAchievements: () => void;
  /** Carteira + progressão demo ficam isoladas da conta. */
  playMode: "demo" | "online";
  progressionProfile: ProgressionProfile;
  onSignIn?: () => void;
}

/** Contagem estável “social proof” por dia (não é tempo real). */
function pseudoOnlinePlayers(): number {
  const d = new Date();
  const daySeed =
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return 2400 + (daySeed % 650);
}

export const LobbyScreen = ({
  walletBalance,
  nickname,
  bestScore,
  onPlay,
  onWallet,
  onHistory,
  onRules,
  onChangeName,
  onLeaderboard,
  onMissions,
  onAchievements,
  playMode,
  progressionProfile,
  onSignIn,
}: Props) => {
  const prog = loadProgression(progressionProfile);
  const lvl = levelFromXp(prog.xp);
  const missionsLeft = prog.missions.list.filter((m) => !m.done).length;
  const online = pseudoOnlinePlayers();

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="absolute inset-0 flex flex-col bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background overflow-y-auto">
      <div className="w-full max-w-md mx-auto flex flex-col flex-1 px-5 pt-6 pb-8 gap-5">
        <div
          className={`rounded-xl border px-3 py-2 text-[10px] leading-snug ${
            playMode === "demo"
              ? "border-[hsl(180_70%_45%/0.45)] bg-[hsl(195_40%_12%/0.6)] text-muted-foreground"
              : "border-[hsl(140_50%_35%/0.35)] bg-[hsl(140_25%_10%/0.45)] text-muted-foreground"
          }`}
        >
          {playMode === "demo" ? (
            <>
              <span className="font-black uppercase tracking-wide text-glow-cyan">Demo</span> — créditos
              fictícios neste aparelho. Não há saque nem vínculo com a conta online.
            </>
          ) : (
            <>
              <span className="font-black uppercase tracking-wide text-[hsl(140_90%_58%)]">Conta</span> — saldo
              no servidor. Rodadas oficiais e ranking após login.
            </>
          )}
        </div>

        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center shadow-lg shrink-0">
              <span className="text-lg font-black text-background leading-none">N</span>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Neon Split
              </div>
              <div className="font-black text-sm truncate text-glow-cyan">Jogue e ganhe</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onWallet}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[hsl(140_80%_42%/0.25)] border border-[hsl(140_80%_45%)] text-[hsl(140_90%_65%)] text-xs font-black uppercase tracking-wide"
              title="Carteira"
            >
              <Wallet size={16} />
              <span className="tabular-nums">{fmt(walletBalance)}</span>
            </button>
            <button
              type="button"
              onClick={onHistory}
              className="p-2 rounded-xl border border-border bg-card/50 text-muted-foreground hover:text-foreground"
              aria-label="Histórico de rodadas"
              title="Histórico"
            >
              <ScrollText size={18} />
            </button>
          </div>
        </header>

        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-card/60 border border-border text-[11px] font-semibold text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(140_90%_55%)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(140_90%_55%)]" />
            </span>
            <Users size={14} className="text-[hsl(140_90%_60%)]" />
            {online.toLocaleString("pt-BR")} jogadores online agora
          </div>
        </div>

        <section className="text-center space-y-3 pt-2">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            PASSE BARREIRAS
            <br />
            <span className="text-glow-magenta">E RESGATE CRÉDITOS</span>
          </h1>
          <p className="text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
            {playMode === "demo"
              ? "Experimente com créditos fictícios locais. Para saldo servidor e ranking, entre com uma conta."
              : "Créditos na conta, rodadas liquidadas no servidor e ranking global."}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card/40 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[11px] font-black text-background">
                  {lvl.level}
                </div>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Nível
                </span>
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {lvl.intoLevel}/{lvl.needed} XP
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-secondary transition-all"
                style={{ width: `${lvl.progress * 100}%` }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/40 p-3 flex flex-col justify-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Créditos de meta (progressão)
            </div>
            <div className="text-xl font-black text-glow-yellow tabular-nums">{prog.credits}</div>
          </div>
        </div>

        {prog.streak >= 1 && (
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-orange-300">
              <Flame size={16} className="text-orange-400" />
              <span className="text-sm font-black">
                {prog.streak === 1 ? "Sequência iniciada!" : `${prog.streak} dias seguidos`}
              </span>
            </div>
            {prog.streak >= 2 && (
              <span className="text-[10px] text-orange-400/80 font-semibold uppercase tracking-wide">
                +{prog.streak >= 7 ? 20 : prog.streak >= 5 ? 15 : prog.streak >= 3 ? 10 : 5}% XP
              </span>
            )}
          </div>
        )}

        {bestScore > 0 && (
          <div className="rounded-xl border border-border bg-card/30 px-4 py-3 text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Recorde
            </div>
            <div className="text-2xl font-black text-glow-cyan tabular-nums">
              {bestScore.toLocaleString("pt-BR")}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 mt-auto">
          <button
            type="button"
            onClick={onPlay}
            className="w-full py-4 rounded-2xl bg-[hsl(140_85%_48%)] hover:bg-[hsl(140_85%_42%)] text-background font-black uppercase tracking-widest text-lg shadow-[0_0_24px_hsl(140_90%_45%/0.45)] flex items-center justify-center gap-2 border border-[hsl(140_90%_55%)]"
          >
            <Play size={22} fill="currentColor" />
            Iniciar partida
          </button>

          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div className="rounded-lg border border-border bg-card/40 px-2 py-2 text-center text-muted-foreground">
              <span className="text-[hsl(140_90%_58%)] mr-1">✓</span>
              Saldo virtual
            </div>
            <div className="rounded-lg border border-border bg-card/40 px-2 py-2 text-center text-muted-foreground">
              <span className="text-[hsl(140_90%_58%)] mr-1">✓</span>
              Entrada mín. baixa
            </div>
            <div className="rounded-lg border border-border bg-card/40 px-2 py-2 text-center text-muted-foreground">
              <span className="text-[hsl(140_90%_58%)] mr-1">✓</span>
              Resultado na hora
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onMissions}
              className="relative py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
            >
              <Target size={14} />
              Missões
              {missionsLeft > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-accent text-accent-foreground text-[10px] font-black flex items-center justify-center">
                  {missionsLeft}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onAchievements}
              className="py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
            >
              <Award size={14} />
              Conquistas
            </button>
          </div>

          <button
            type="button"
            onClick={onLeaderboard}
            className="w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <Trophy size={16} />
            Ranking
          </button>

          <button
            type="button"
            onClick={onRules}
            className="w-full py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <BookOpen size={16} />
            Regras
          </button>

          {onSignIn && (
            <button
              type="button"
              onClick={onSignIn}
              className="w-full py-3 text-xs font-bold uppercase tracking-widest rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 flex items-center justify-center gap-2"
            >
              <LogIn size={16} />
              Entrar com conta
            </button>
          )}

          <button
            type="button"
            onClick={onChangeName}
            className="w-full py-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Apelido: <span className="text-foreground font-bold">{nickname}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
