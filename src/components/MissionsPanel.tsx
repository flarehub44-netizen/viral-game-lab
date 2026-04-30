import { ArrowLeft, Target, Check } from "lucide-react";
import { loadProgression } from "@/game/progression";

interface Props {
  onBack: () => void;
}

export const MissionsPanel = ({ onBack }: Props) => {
  const data = loadProgression();
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
          <h2 className="text-2xl font-black text-glow-cyan flex items-center gap-2">
            <Target size={22} /> Missões
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Reseta à meia-noite
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {data.missions.list.map((m) => {
          const pct = Math.min(100, (m.progress / m.goal) * 100);
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-4 ${
                m.done
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="text-sm font-bold">{m.label}</div>
                <div className="flex items-center gap-1 text-xs font-bold text-glow-yellow tabular-nums">
                  +{m.xp} XP
                  {m.done && <Check size={14} className="text-primary" />}
                </div>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-secondary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1 tabular-nums">
                {Math.min(m.progress, m.goal)} / {m.goal}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
