import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { BugReportButton } from "@/components/layout/BugReportButton";
import { queryClient, initQueryPersistence } from "@/lib/queryClient";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import PublicVault from "./pages/PublicVaultSimple";
import VaultDetail from "./pages/VaultDetail";
import TheCodex from "./pages/TheCodex";
import OpenGraphPreview from "./pages/OpenGraphPreview";
import Users from "./pages/Users";
import ProfileEdit from "./pages/ProfileEdit";
import SignupNextSteps from "./pages/SignupNextSteps";
import ResetPassword from "./pages/ResetPassword";
import { VaultContentProvider } from "./contexts/VaultContentContext";

// Initialize query persistence on module load
initQueryPersistence();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <VaultContentProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BugReportButton />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/codex" element={<TheCodex />} />
              <Route path="/users" element={<Users />} />
              <Route path="/public/:slug" element={<PublicVault />} />
              <Route path="/vault/:id" element={<VaultDetail />} />
              <Route path="/opengraphpreview" element={<OpenGraphPreview />} />
              <Route path="/profile-edit" element={<ProfileEdit />} />
              <Route path="/signup-next-steps" element={<SignupNextSteps />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </VaultContentProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
