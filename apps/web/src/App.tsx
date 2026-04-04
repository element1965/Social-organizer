import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { trpc, getTrpcClient } from './lib/trpc';
import { Layout } from './components/Layout';
import { TelegramBootstrap } from './components/TelegramBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NativePushBootstrap } from './components/NativePushBootstrap';
// RequiredInfoGate removed — contacts are now optional, prompted via settings hint
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
import { MatchesPage } from './pages/MatchesPage';
import { InvitePage } from './pages/InvitePage';
import { SosLandingPage } from './pages/SosLandingPage';
import { SupportChatPage } from './pages/SupportChatPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { FaqPage } from './pages/FaqPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';

const isArvut = window.location.hostname.startsWith('arvuthadadit');
const isNativeApp = Capacitor.isNativePlatform();

/** Redirect authenticated users away from landing page to dashboard (prevents flash). */
function HomeRoute() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const [params] = useSearchParams();

  // Authenticated → dashboard (web and native)
  if (isAuthenticated && !params.get('invite') && !params.get('from') && !localStorage.getItem('pendingInviteToken')) {
    return <Navigate to="/dashboard" replace />;
  }

  // Native app: landing page doesn't make sense — send to login or invite
  if (isNativeApp) {
    const inviteParam = params.get('invite');
    if (inviteParam) {
      return <Navigate to={`/invite/${inviteParam}`} replace />;
    }
    // Preserve any redirect param passed from ProtectedRoute
    const redirectParam = params.get('redirect');
    return <Navigate to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'} replace />;
  }

  return <LandingPage variant={isArvut ? 'arvut' : undefined} />;
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
          <NativePushBootstrap />
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/welcome" element={<LandingPage variant={isArvut ? 'arvut' : undefined} />} />
            <Route path="/arvut" element={<LandingPage variant="arvut" />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/delete-account" element={<DeleteAccountPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/sos/:collectionId" element={<SosLandingPage />} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/create" element={<CreateCollectionPage />} />
              <Route path="/collection/:id" element={<CollectionPage />} />
              <Route path="/network" element={<MyNetworkPage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/matches" element={<MatchesPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/support" element={<SupportChatPage />} />
            </Route>
          </Routes>
          </TelegramBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
