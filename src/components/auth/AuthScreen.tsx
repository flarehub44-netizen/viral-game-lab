import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AuthScreenProps {
  onPlayDemo?: () => void;
}

export const AuthScreen = ({ onPlayDemo }: AuthScreenProps) => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Preencha e-mail e senha.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email.trim(), password);
        if (error) throw error;
        toast.success("Conectado.");
      } else {
        if (!displayName.trim()) {
          toast.error("Escolha um apelido.");
          setBusy(false);
          return;
        }
        const { error } = await signUp(email.trim(), password, displayName.trim());
        if (error) throw error;
        toast.success("Conta criada. Verifique o e-mail se a confirmação estiver ativa.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na autenticação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[hsl(270_45%_10%)] via-background to-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-glow-cyan">Neon Split</h1>
          <p className="text-sm text-muted-foreground">
            Entre ou cadastre-se para saldo no servidor e rodadas oficiais. Conta usa e-mail apenas para login —
            veja os termos no app.
          </p>
        </div>

        <div className="flex rounded-xl border border-border p-1 bg-card/40">
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg ${mode === "register" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("register")}
          >
            Cadastrar
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Apelido (ranking)
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={24}
                autoComplete="nickname"
              />
            </div>
          )}
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              E-mail
            </label>
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Senha
            </label>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="btn-neon w-full py-3 rounded-xl font-black uppercase tracking-widest text-sm disabled:opacity-50"
          >
            {busy ? "Aguarde..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        {onPlayDemo && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onPlayDemo()}
              className="w-full py-3 rounded-xl border-2 border-[hsl(180_70%_45%/0.5)] bg-card/50 font-black uppercase tracking-widest text-xs text-glow-cyan hover:bg-card/70 disabled:opacity-50"
            >
              Jogar demo (sem conta)
            </button>
            <p className="text-[9px] text-center text-muted-foreground px-2">
              Créditos fictícios só neste aparelho. Perfil separado da conta online.
            </p>
          </div>
        )}

        <p className="text-[10px] text-center text-muted-foreground leading-relaxed px-2">
          Jogue com responsabilidade. Proibido para menores de 18 anos. O resultado da rodada é definido no
          servidor ao iniciar a partida.
        </p>
      </div>
    </div>
  );
};
