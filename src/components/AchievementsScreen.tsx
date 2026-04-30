import { ArrowLeft } from "lucide-react";
import { getAllWithStatus } from "@/game/achievements";

interface Props {
  onBack: () => void;
}

export const AchievementsScreen = ({ onBack }: Props) => {
  const list = getAllWithStatus();
  const unlocked = list.filter((a) => a.unlocked).length;

  return (
    <div className="relative w-full h-full flex flex-col px-4 py-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onBack}
          className="p-2 rounded-md bg-card/60 border border-border text-muted-foreground hover:text-foreground"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-xl font-bold text-glow-magenta">
          Conquistas
        </h2>
        <div className="w-9" />
      </div>

      <div className="text-center mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {unlocked} / {list.length} desbloqueadas
      </div>

      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        <ul className="space-y-2">
          {list.map((a) => (
            <li
              key={a.id}
              className={`flex items-center gap-3 px-3 py-3 rounded-lg border ${
                a.unlocked
                  ? "bg-primary/10 border-primary/40"
                  : "bg-card/40 border-border opacity-60"
              }`}
            >
              <div
                className={`text-2xl shrink-0 ${a.unlocked ? "" : "grayscale"}`}
              >
                {a.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`font-bold text-sm ${
                    a.unlocked ? "text-glow-cyan" : "text-foreground/80"
                  }`}
                >
                  {a.name}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {a.description}
                </div>
              </div>
              {a.unlocked && (
                <div className="text-[10px] uppercase tracking-widest text-primary">
                  ✓
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
