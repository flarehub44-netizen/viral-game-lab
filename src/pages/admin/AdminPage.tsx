import { useEffect, useState } from "react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabaseExternal";
import NotFound from "@/pages/NotFound";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-[10px] font-black uppercase rounded-lg border ${
    isActive
      ? "border-[hsl(280_70%_50%)] bg-[hsl(280_35%_18%)] text-[hsl(280_90%_75%)]"
      : "border-border bg-card/40 text-muted-foreground"
  }`;

const AdminPage = () => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setAllowed(false);
      setChecking(false);
      return;
    }
    let c = false;
    (async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (c) return;
      if (error || !data) setAllowed(false);
      else setAllowed(true);
      setChecking(false);
    })();
    return () => {
      c = true;
    };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Verificando acesso…
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  if (!allowed) {
    return <NotFound />;
  }

  // Ocultar o header/menu admin na página /admin/sandbox para deixar a
  // experiência de jogo igual ao demo (sem barra de navegação no topo).
  const hideHeader = location.pathname.startsWith("/admin/sandbox");

  return (
    <div className="min-h-screen bg-background text-foreground pb-8">
      {!hideHeader && (
        <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur px-3 py-2 flex items-center gap-2 flex-wrap">
          <NavLink
            to="/"
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Voltar ao app"
          >
            <ArrowLeft size={18} />
          </NavLink>
          <span className="text-sm font-black uppercase tracking-wide">Admin</span>
          <nav className="flex flex-wrap gap-1.5 ml-auto">
            <NavLink to="/admin/overview" className={tabClass}>
              Visão
            </NavLink>
            <NavLink to="/admin/sandbox" className={tabClass}>
              Sandbox
            </NavLink>
            <NavLink to="/admin/users" className={tabClass}>
              Usuários
            </NavLink>
            <NavLink to="/admin/flags" className={tabClass}>
              Flags
            </NavLink>
            <NavLink to="/admin/fraud" className={tabClass}>
              Fraude
            </NavLink>
          </nav>
        </header>
      )}
      <Outlet />
    </div>
  );
};

export default AdminPage;
