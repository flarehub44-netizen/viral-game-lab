import { UserPlus, LogIn } from "lucide-react";

interface Props {
  onCreateAccount: () => void;
  onLogin: () => void;
}

export const DemoLimitPopup = ({ onCreateAccount, onLogin }: Props) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl text-center">
        <h2 className="text-xl font-black text-glow-cyan mb-3">Gostou?</h2>
        <p className="text-sm text-foreground mb-2">
          Esse é para ser o seu resultado agora.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Crie sua conta para continuar jogando!
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={onCreateAccount}
            className="btn-neon w-full py-3 text-sm font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2"
          >
            <UserPlus size={16} />
            Criar conta
          </button>
          <button
            onClick={onLogin}
            className="w-full py-3 text-sm font-bold uppercase tracking-widest rounded-xl border border-border bg-card/40 hover:bg-card/60 text-foreground flex items-center justify-center gap-2"
          >
            <LogIn size={16} />
            Fazer login
          </button>
        </div>
      </div>
    </div>
  );
};
