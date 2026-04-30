import { Trophy, Play, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttractCanvas } from "./AttractCanvas";
import { getTodayMissions, getStreak, type Mission } from "@/game/missions";
import { SKINS, getSelectedSkin, setSelectedSkin, isUnlocked, getLifetimeScore } from "@/game/skins";

interface Props {
  bestScore: number;
  nickname: string;
  onPlay: () => void;
  onChangeName: () => void;
  onLeaderboard: () => void;
  challenge?: { score: number } | null;
}

export const StartScreen = ({
  bestScore,
  nickname,
  onPlay,
  onChangeName,
  onLeaderboard,
  challenge,
}: Props) => {
  const [pulse, setPulse] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [streak, setStreak] = useState(0);
  const [selectedSkinId, setSelectedSkinId] = useState(() => getSelectedSkin().id);
  const lifetime = useMemo(() => getLifetimeScore(), []);

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
      {/* Demo loop ao fundo */}
      <AttractCanvas />
      {/* Vinheta para legibilidade */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/30 to-background/80 pointer-events-none" />

      <div className="relative w-full h-full flex flex-col items-center justify-between py-8 px-6 overflow-y-auto">
        {/* Título */}
        <div className="text-center mt-4 shrink-0">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight">
            <span className="text-glow-cyan">NEON</span>
            <br />
            <span className="text-glow-magenta">SPLIT</span>
          </h1>
          <p className="mt-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Toque · Divida · Sobreviva
          </p>
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
        <div className="flex flex-col items-center gap-3 w-full max-w-xs shrink-0">
          <button
            onClick={onPlay}
            className={`btn-neon w-full py-5 text-xl rounded-2xl ${pulse ? "pulse-glow" : ""}`}
          >
            <Play className="inline mr-2" size={20} />
            Jogar
          </button>

          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              onClick={onLeaderboard}
              className="px-4 py-3 rounded-xl border border-border bg-card/60 text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center justify-center gap-2"
            >
              <Trophy size={14} />
              Ranking
            </button>
            <button
              onClick={onChangeName}
              className="px-4 py-3 rounded-xl border border-border bg-card/60 text-sm uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors truncate"
            >
              👤 {nickname}
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
          v1.1
        </div>
      </div>
    </div>
  );
};
