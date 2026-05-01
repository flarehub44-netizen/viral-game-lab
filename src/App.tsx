import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminPage from "./pages/admin/AdminPage.tsx";
import { AdminOverview } from "./pages/admin/AdminOverview.tsx";
import { AdminSandbox } from "./pages/admin/AdminSandbox.tsx";
import { AdminUsers } from "./pages/admin/AdminUsers.tsx";
import { AdminFlags } from "./pages/admin/AdminFlags.tsx";
import { AdminFraud } from "./pages/admin/AdminFraud.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/admin" element={<AdminPage />}>
              <Route index element={<Navigate to="/admin/overview" replace />} />
              <Route path="overview" element={<AdminOverview />} />
              <Route path="sandbox" element={<AdminSandbox />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="flags" element={<AdminFlags />} />
              <Route path="fraud" element={<AdminFraud />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
