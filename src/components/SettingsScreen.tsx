import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { getSettings, updateSettings } from "@/game/settings";
import { GameEngine } from "@/game/engine";

interface Props {
  onBack: () => void;
}

export const SettingsScreen = ({ onBack }: Props) => {
  const [s, setS] = useState(() => getSettings());

  const apply = (patch: Partial<typeof s>) => {
    const next = updateSettings(patch);
    setS(next);
    if (patch.colorblind !== undefined) {
      GameEngine.colorblindEnabled = patch.colorblind;
    }
  };

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
        <h2 className="text-xl font-bold text-glow-yellow">Settings</h2>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 -mx-1 px-1">
        <Slider
          label="SFX"
          value={s.sfxVolume}
          onChange={(v) => apply({ sfxVolume: v })}
        />
        <Slider
          label="Música"
          value={s.musicVolume}
          onChange={(v) => apply({ musicVolume: v })}
        />
        <Toggle
          label="Vibração"
          description="Feedback haptic em colisões e bônus"
          value={s.hapticsEnabled}
          onChange={(v) => apply({ hapticsEnabled: v })}
        />
        <Toggle
          label="Mostrar FPS"
          description="Exibe contador de frames no canto"
          value={s.showFps}
          onChange={(v) => apply({ showFps: v })}
        />
        <Toggle
          label="Modo daltônico"
          description="Adiciona padrão listrado nas barreiras"
          value={s.colorblind}
          onChange={(v) => apply({ colorblind: v })}
        />
      </div>
    </div>
  );
};

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span className="text-xs tabular-nums text-foreground/80">
          {Math.round(value * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground">{description}</div>
        )}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-12 h-7 rounded-full transition-colors ${
          value ? "bg-primary" : "bg-card border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-background transition-transform ${
            value ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}
