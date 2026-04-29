import { useEffect, useState } from "react";

interface Props {
  current: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export const NicknameDialog = ({ current, onSave, onCancel }: Props) => {
  const [value, setValue] = useState(current);

  useEffect(() => setValue(current), [current]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().slice(0, 20);
    if (trimmed.length === 0) return;
    onSave(trimmed);
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs bg-card border border-primary/40 rounded-2xl p-6 shadow-2xl"
        style={{ boxShadow: "0 0 40px hsl(var(--primary) / 0.3)" }}
      >
        <h3 className="text-lg font-bold text-glow-cyan mb-4 text-center">
          Seu apelido
        </h3>
        <input
          autoFocus
          maxLength={20}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-input border border-border focus:border-primary focus:outline-none text-center font-bold text-lg"
          placeholder="Player"
        />
        <div className="text-[10px] text-muted-foreground text-center mt-2 uppercase tracking-widest">
          Aparece no ranking
        </div>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground text-sm uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn-neon py-3 rounded-xl text-sm"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
};
