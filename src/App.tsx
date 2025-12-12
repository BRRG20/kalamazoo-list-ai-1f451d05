import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthGuard } from "@/components/AuthGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import BatchesPage from "./pages/BatchesPage";
import SettingsPage from "./pages/SettingsPage";
import HelpPage from "./pages/HelpPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary fallbackMessage="The application encountered an unexpected error. Please refresh the page.">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-right" />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={
              <ErrorBoundary fallbackMessage="Unable to load the login page.">
                <AuthPage />
              </ErrorBoundary>
            } />
            <Route path="/reset-password" element={
              <ErrorBoundary fallbackMessage="Unable to load the password reset page.">
                <ResetPasswordPage />
              </ErrorBoundary>
            } />
            <Route path="/" element={
              <AuthGuard>
                <ErrorBoundary fallbackMessage="Unable to load the batch listing page. Please try again.">
                  <BatchesPage />
                </ErrorBoundary>
              </AuthGuard>
            } />
            <Route path="/settings" element={
              <AuthGuard>
                <ErrorBoundary fallbackMessage="Unable to load the settings page.">
                  <SettingsPage />
                </ErrorBoundary>
              </AuthGuard>
            } />
            <Route path="/help" element={
              <AuthGuard>
                <ErrorBoundary fallbackMessage="Unable to load the help page.">
                  <HelpPage />
                </ErrorBoundary>
              </AuthGuard>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
