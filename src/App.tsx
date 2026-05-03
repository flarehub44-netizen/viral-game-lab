import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";

const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage.tsx"));
const AdminOverview = lazy(() =>
  import("./pages/admin/AdminOverview.tsx").then((m) => ({ default: m.AdminOverview })),
);
const AdminSandbox = lazy(() =>
  import("./pages/admin/AdminSandbox.tsx").then((m) => ({ default: m.AdminSandbox })),
);
const AdminUsers = lazy(() =>
  import("./pages/admin/AdminUsers.tsx").then((m) => ({ default: m.AdminUsers })),
);
const AdminFlags = lazy(() =>
  import("./pages/admin/AdminFlags.tsx").then((m) => ({ default: m.AdminFlags })),
);
const AdminFraud = lazy(() =>
  import("./pages/admin/AdminFraud.tsx").then((m) => ({ default: m.AdminFraud })),
);
const AdminWithdrawals = lazy(() =>
  import("./pages/admin/AdminWithdrawals.tsx").then((m) => ({ default: m.AdminWithdrawals })),
);
const AdminArcade = lazy(() => import("./pages/admin/AdminArcade.tsx"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense
            fallback={
              <main className="fixed inset-0 flex items-center justify-center bg-background text-muted-foreground text-sm">
                Carregando...
              </main>
            }
          >
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/admin" element={<AdminPage />}>
                <Route index element={<Navigate to="/admin/overview" replace />} />
                <Route path="overview" element={<AdminOverview />} />
                <Route path="sandbox" element={<AdminSandbox />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="flags" element={<AdminFlags />} />
                <Route path="fraud" element={<AdminFraud />} />
                <Route path="withdrawals" element={<AdminWithdrawals />} />
                <Route path="arcade" element={<AdminArcade />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
