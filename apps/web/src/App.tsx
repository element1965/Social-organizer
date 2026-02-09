import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc, getTrpcClient } from './lib/trpc';
import { Layout } from './components/Layout';
import { TelegramBootstrap } from './components/TelegramBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { CollectionPage } from './pages/CollectionPage';
import { CreateCollectionPage } from './pages/CreateCollectionPage';
import { MyNetworkPage } from './pages/MyNetworkPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { InvitePage } from './pages/InvitePage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { FaqPage } from './pages/FaqPage';

/** Redirect authenticated users away from landing page to dashboard (prevents flash). */
function HomeRoute() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const [params] = useSearchParams();
  // Keep landing visible when invite/demo params present
  if (isAuthenticated && !params.get('invite') && !params.get('from') && !localStorage.getItem('pendingInviteToken')) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
}

export function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }));
  const [trpcClient] = useState(() => getTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TelegramBootstrap>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/welcome" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/create" element={<CreateCollectionPage />} />
              <Route path="/collection/:id" element={<CollectionPage />} />
              <Route path="/network" element={<MyNetworkPage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/faq" element={<FaqPage />} />
            </Route>
          </Routes>
          </TelegramBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
