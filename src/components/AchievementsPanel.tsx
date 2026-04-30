import { ArrowLeft, Award, Lock } from "lucide-react";
import { getAllAchievements, loadProgression, type ProgressionProfile } from "@/game/progression";

interface Props {
  onBack: () => void;
  progressionProfile?: ProgressionProfile;
}

export const AchievementsPanel = ({ onBack, progressionProfile = "default" }: Props) => {
  const data = loadProgression(progressionProfile);
  const all = getAllAchievements();
  const unlocked = new Set(data.achievements);

  return (
    <div className="absolute inset-0 flex flex-col p-6 bg-gradient-to-b from-background via-background to-card overflow-y-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-md bg-card/60 backdrop-blur border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-2xl font-black text-glow-magenta flex items-center gap-2">
            <Award size={22} /> Conquistas
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {unlocked.size} de {all.length} desbloqueadas
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {all.map((a) => {
          const has = unlocked.has(a.id);
          return (
            <div
              key={a.id}
              className={`rounded-xl border p-3 ${
                has
                  ? "border-secondary bg-secondary/10"
                  : "border-border bg-card/40 opacity-60"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {has ? (
                  <Award size={16} className="text-glow-magenta" />
                ) : (
                  <Lock size={14} className="text-muted-foreground" />
                )}
                <div className="text-xs font-bold">{a.label}</div>
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug">
                {a.description}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
