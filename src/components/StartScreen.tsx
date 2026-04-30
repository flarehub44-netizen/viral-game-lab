import { Trophy, Play, Lock, Award, Settings as SettingsIcon, Calendar } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getTodayMissions, getStreak, type Mission } from "@/game/missions";
import { SKINS, getSelectedSkin, setSelectedSkin, isUnlocked, getLifetimeScore } from "@/game/skins";
import { getLevelInfo } from "@/game/progression";

interface Props {
  bestScore: number;
  nickname: string;
  onPlay: () => void;
  onChangeName: () => void;
  onLeaderboard: () => void;
  onAchievements: () => void;
  onSettings: () => void;
  onDaily: () => void;
  challenge?: { score: number } | null;
}

export const StartScreen = ({
  bestScore,
  nickname,
  onPlay,
  onChangeName,
  onLeaderboard,
  onAchievements,
  onSettings,
  onDaily,
  challenge,
}: Props) => {
  const [pulse, setPulse] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [streak, setStreak] = useState(0);
  const [selectedSkinId, setSelectedSkinId] = useState(() => getSelectedSkin().id);
  const lifetime = useMemo(() => getLifetimeScore(), []);
  const level = useMemo(() => getLevelInfo(), []);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => !p), 1200);
    setMissions(getTodayMissions());
    setStreak(getStreak());
    return () => clearInterval(t);
  }, []);

  const handleSkin = (id: string) => {
    const s = SKINS.find((x) => x.id === id);
    if (!s || !isUnlocked(s)) return;
    setSelectedSkin(id);
    setSelectedSkinId(id);
  };

  const completedCount = missions.filter((m) => m.completed).length;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        className="absolute -top-20 -left-20 w-72 h-72 rounded-full blur-3xl opacity-30"
        style={{ background: "hsl(var(--neon-cyan))" }}
      />
      <div
        className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full blur-3xl opacity-20"
        style={{ background: "hsl(var(--neon-magenta))" }}
      />

      <div className="relative w-full h-full flex flex-col items-center justify-between py-6 px-6 overflow-y-auto">
        <div className="text-center mt-2 shrink-0">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight">
            <span className="text-glow-cyan">NEON</span>
            <br />
            <span className="text-glow-magenta">SPLIT</span>
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Toque · Divida · Sobreviva
          </p>
        </div>

        {/* Level bar */}
        <div className="w-full max-w-xs shrink-0">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            <span>Nível {level.level}</span>
            <span className="tabular-nums">
              {level.xpInLevel}/{level.xpForNextLevel} XP
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-card/60 border border-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${level.progress * 100}%`,
                background: "linear-gradient(90deg, hsl(180,100%,60%), hsl(320,100%,60%))",
                boxShadow: "0 0 8px hsl(180,100%,60%)",
              }}
            />
          </div>
        </div>

        {challenge && (
          <div className="px-5 py-3 rounded-xl border border-accent/50 bg-accent/10 text-center max-w-xs float-up shrink-0">
            <div className="text-[10px] uppercase tracking-widest text-accent">
              Desafio recebido
            </div>
            <div className="text-lg font-bold text-glow-yellow mt-1">
              Bata {challenge.score.toLocaleString()} pontos
            </div>
          </div>
        )}

        {/* Missões diárias */}
        {missions.length > 0 && (
          <div className="w-full max-w-xs rounded-xl border border-border bg-card/50 backdrop-blur p-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Missões do dia · {completedCount}/3
              </div>
              {streak > 0 && (
                <div className="text-[10px] text-glow-yellow">🔥 {streak}d</div>
              )}
            </div>
            <ul className="space-y-1.5">
              {missions.map((m) => {
                const pct = Math.min(100, (m.progress / m.target) * 100);
                return (
                  <li key={m.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          m.completed ? "text-glow-cyan line-through" : "text-foreground/80"
                        }
                      >
                        {m.completed ? "✓ " : ""}
                        {m.label}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                        {Math.min(m.progress, m.target)}/{m.target}
                      </span>
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-background/60 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: m.completed
                            ? "hsl(180,100%,60%)"
                            : "hsl(320,80%,55%)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Skins */}
        <div className="w-full max-w-xs shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 text-center">
            Skin · {lifetime.toLocaleString()} pts lifetime
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
            {SKINS.map((s) => {
              const unlocked = isUnlocked(s);
              const selected = s.id === selectedSkinId;
              return (
                <button
                  key={s.id}
                  onClick={() => handleSkin(s.id)}
                  disabled={!unlocked}
                  className={`relative w-12 h-12 rounded-full border-2 shrink-0 transition-all ${
                    selected ? "border-primary scale-110" : "border-border"
                  } ${!unlocked ? "opacity-40 cursor-not-allowed" : "hover:scale-105"}`}
                  style={{ background: s.preview }}
                  title={
                    unlocked
                      ? s.name
                      : `${s.name} — desbloqueia em ${s.unlockAt.toLocaleString()} pts`
                  }
                >
                  {!unlocked && (
                    <Lock
                      size={14}
                      className="absolute inset-0 m-auto text-foreground/80"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Botões principais */}
        <div className="flex flex-col items-center gap-2 w-full max-w-xs shrink-0">
          <button
            onClick={onPlay}
            className={`btn-neon w-full py-5 text-xl rounded-2xl ${pulse ? "pulse-glow" : ""}`}
          >
            <Play className="inline mr-2" size={20} />
            Jogar
          </button>

          <button
            onClick={onDaily}
            className="w-full px-4 py-2.5 rounded-xl border border-accent/40 bg-accent/10 text-accent text-sm uppercase tracking-wider hover:bg-accent/20 transition-colors flex items-center justify-center gap-2"
          >
            <Calendar size={14} />
            Desafio Diário
          </button>

          <div className="grid grid-cols-2 gap-2 w-full">
            <button
              onClick={onLeaderboard}
              className="px-3 py-2.5 rounded-xl border border-border bg-card/60 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Trophy size={13} />
              Ranking
            </button>
            <button
              onClick={onAchievements}
              className="px-3 py-2.5 rounded-xl border border-border bg-card/60 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-1.5"
            >
              <Award size={13} />
              Conquistas
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full">
            <button
              onClick={onChangeName}
              className="px-3 py-2.5 rounded-xl border border-border bg-card/60 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors truncate"
            >
              👤 {nickname}
            </button>
            <button
              onClick={onSettings}
              className="px-3 py-2.5 rounded-xl border border-border bg-card/60 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
            >
              <SettingsIcon size={13} />
              Settings
            </button>
          </div>

          {bestScore > 0 && (
            <div className="text-center mt-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Seu recorde
              </div>
              <div className="text-2xl font-bold text-glow-yellow tabular-nums">
                {bestScore.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-widest shrink-0">
          v2.0
        </div>
      </div>
    </div>
  );
};
