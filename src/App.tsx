import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { BugReportButton } from "@/components/layout/BugReportButton";
import { ScrollToTopButton } from "@/components/layout/ScrollToTopButton";
import { queryClient, initQueryPersistence } from "@/lib/queryClient";
import { KeyboardProvider } from "@/contexts/KeyboardContext";
import { KeyboardHelpOverlay } from "@/components/ui/KeyboardHelpOverlay";
import { useKeyboardAnalytics } from "@/hooks/useKeyboardAnalytics";
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
import UserProfile from "./pages/UserProfile";
import ProfileEdit from "./pages/ProfileEdit";
import SignupNextSteps from "./pages/SignupNextSteps";
import ResetPassword from "./pages/ResetPassword";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { VaultContentProvider } from "./contexts/VaultContentContext";

/** Activates keyboard shortcut analytics tracking. Must be inside KeyboardProvider. */
function KeyboardAnalyticsTracker() {
  useKeyboardAnalytics();
  return null;
}

const App = () => {
  // Defer query persistence initialization to after first render
  // This improves initial loading performance
  useEffect(() => {
    // Initialize persistence after the app shell renders
    const timeoutId = setTimeout(() => {
      initQueryPersistence();
    }, 0);
    
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VaultContentProvider>
          <KeyboardProvider>
            <KeyboardAnalyticsTracker />
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <ScrollToTopButton />
              <BugReportButton />
              <KeyboardHelpOverlay />
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/codex" element={<TheCodex />} />
                  <Route path="/users" element={<Users />} />
                  <Route path="/profile/:username" element={<UserProfile />} />
                  <Route path="/public/:slug" element={<PublicVault />} />
                  <Route path="/vault/:id" element={<VaultDetail />} />
                  <Route path="/opengraphpreview" element={<OpenGraphPreview />} />
                  <Route path="/profile-edit" element={<ProfileEdit />} />
                  <Route path="/signup-next-steps" element={<SignupNextSteps />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/tos" element={<TermsOfService />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </KeyboardProvider>
        </VaultContentProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
