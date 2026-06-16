import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
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
import { GoogleCallbackPage } from './pages/GoogleCallbackPage';
import { AppleCallbackPage } from './pages/AppleCallbackPage';

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

function GoogleAuthDeepLinkHandler() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  // Deduplicate by exact URL: getLaunchUrl() and the appUrlOpen listener can both
  // deliver the SAME deep link. On iPad getLaunchUrl() keeps returning the auth
  // deep link after navigation, so the previous full-page reload
  // (window.location.href) re-ran this handler on every load → an endless
  // blue/white reload loop. We now (a) process each auth URL at most once and
  // (b) navigate in-app instead of reloading. The tRPC client reads the token
  // from localStorage per request, so no reload is needed for it to pick it up.
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isNativeApp) return;

    const handleUrl = (event: { url?: string }) => {
      const url = event?.url;
      if (!url || !url.startsWith('socialorganizer://auth-')) return;
      if (processedRef.current.has(url)) return;
      processedRef.current.add(url);

      Browser.close().catch(() => {});

      if (!url.startsWith('socialorganizer://auth-success')) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const params = new URLSearchParams(url.split('?')[1] || '');
        const at = params.get('at');
        const rt = params.get('rt');
        const uid = params.get('uid');
        if (at && rt && uid) {
          login(at, rt, uid);
          // Prefer the invite token carried through the OAuth round-trip (inv),
          // fall back to one saved before the browser was opened. This makes the
          // "join the inviter's cluster on first handshake" flow work for Apple
          // sign-in, the same way Telegram passes it via startapp.
          const pendingInvite = params.get('inv') || localStorage.getItem('pendingInviteToken');
          localStorage.removeItem('pendingInviteToken');
          navigate(pendingInvite ? `/invite/${pendingInvite}` : '/dashboard', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      }
    };

    // Handle cold start: app opened via deep link before listener was registered
    CapApp.getLaunchUrl().then((result) => {
      if (result?.url) handleUrl({ url: result.url });
    }).catch(() => {});

    const listenerPromise = CapApp.addListener('appUrlOpen', handleUrl);
    return () => { listenerPromise.then(h => h.remove()); };
  }, [login, navigate]);

  return null;
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
          <GoogleAuthDeepLinkHandler />
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/welcome" element={<LandingPage variant={isArvut ? 'arvut' : undefined} />} />
            <Route path="/arvut" element={<LandingPage variant="arvut" />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
            <Route path="/auth/apple/done" element={<AppleCallbackPage />} />
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
            {/* Legacy/placeholder target — onboarding is folded into the dashboard */}
            <Route path="/onboarding" element={<Navigate to="/dashboard" replace />} />
            {/* Catch-all: never leave the user on a blank/unmatched route */}
            <Route path="*" element={<HomeRoute />} />
          </Routes>
          </TelegramBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
