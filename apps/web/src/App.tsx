import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { trpc, getTrpcClient } from './lib/trpc';
import { TelegramBootstrap } from './components/TelegramBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { NativePushBootstrap } from './components/NativePushBootstrap';
import { AppShell } from './components/ui2/AppShell';
import {
  AccountStub,
  AddQrStub,
  AddScanStub,
  AddStub,
  AskStub,
  CircleStub,
  HelpStub,
  HistoryStub,
  HowStub,
  IntroStub,
  OpenStub,
  PeopleStub,
  PersonStub,
  ProfileRedirect,
  ProfileStub,
  SeedStub,
  StakeStub,
} from './components/ui2/stubs';
import { useAuth } from './hooks/useAuth';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { CollectionPage } from './pages/CollectionPage';
import { RetiredFeaturePage } from './pages/RetiredFeaturePage';
import { InvitePage } from './pages/InvitePage';
import { SosLandingPage } from './pages/SosLandingPage';
import { SupportChatPage } from './pages/SupportChatPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';
import { GoogleCallbackPage } from './pages/GoogleCallbackPage';
import { AppleCallbackPage } from './pages/AppleCallbackPage';

const isArvut = window.location.hostname.startsWith('arvuthadadit');
const isNativeApp = Capacitor.isNativePlatform();

const DevUI = import.meta.env.DEV
  ? lazy(() => import('./components/ui2/DevUIPage').then((module) => ({ default: module.DevUIPage })))
  : null;

function GoogleAuthDeepLinkHandler() {
  const login = useAuth((s) => s.login);
  const navigate = useNavigate();
  // Deduplicate by exact URL: getLaunchUrl() and the appUrlOpen listener can both
  // deliver the SAME deep link. On iPad getLaunchUrl() keeps returning the auth
  // deep link after navigation, so a full-page reload re-ran this handler on every
  // load. Each auth URL is processed once, then we navigate in-app.
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
        const reason = new URLSearchParams(url.split('?')[1] || '').get('reason');
        navigate(reason === 'account_exists' ? '/login?error=account_exists' : '/login?error=failed', { replace: true });
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
          // fall back to one saved before the browser was opened.
          const pendingInvite = params.get('inv') || localStorage.getItem('pendingInviteToken');
          // Keep pendingInviteToken until InvitePage accepts it.
          if (pendingInvite) localStorage.setItem('pendingInviteToken', pendingInvite);
          navigate(pendingInvite ? `/invite/${pendingInvite}` : '/', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      }
    };

    CapApp.getLaunchUrl().then((result) => {
      if (result?.url) handleUrl({ url: result.url });
    }).catch(() => {});

    const listenerPromise = CapApp.addListener('appUrlOpen', handleUrl);
    return () => { listenerPromise.then(h => h.remove()); };
  }, [login, navigate]);

  return null;
}

/** Guest home is the landing page. A signed-in home is the circle, inside the shell. */
function HomeIndex() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const [params] = useSearchParams();

  if (!isAuthenticated && isNativeApp) {
    const inviteParam = params.get('invite');
    if (inviteParam) return <Navigate to={`/invite/${inviteParam}`} replace />;
    const redirectParam = params.get('redirect');
    return <Navigate to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'} replace />;
  }

  if (!isAuthenticated) return <LandingPage variant={isArvut ? 'arvut' : undefined} />;
  return <CircleStub />;
}

function ShellGate() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const location = useLocation();
  const [params] = useSearchParams();

  if (location.pathname === '/' && params.get('invite')) {
    return <Navigate to={`/invite/${params.get('invite')}`} replace />;
  }

  if (!isAuthenticated) {
    if (location.pathname === '/') return <Outlet />;
    const redirectPath = location.pathname + location.search;
    if (isNativeApp) return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
    return <Navigate to={`/?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  if (location.pathname === '/' ) {
    const pendingInvite = localStorage.getItem('pendingInviteToken');
    if (pendingInvite) return <Navigate to={`/invite/${pendingInvite}`} replace />;
  }

  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  );
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
            <Route path="/how" element={<HowStub />} />
            <Route path="/intro" element={<ProtectedRoute><IntroStub /></ProtectedRoute>} />
            <Route path="/seed" element={<ProtectedRoute><SeedStub /></ProtectedRoute>} />

            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/network" element={<Navigate to="/" replace />} />
            <Route path="/notifications" element={<Navigate to="/" replace />} />
            <Route path="/create" element={<Navigate to="/ask" replace />} />
            <Route path="/settings" element={<Navigate to="/me" replace />} />
            <Route path="/faq" element={<Navigate to="/me/help" replace />} />
            <Route path="/onboarding" element={<Navigate to="/intro" replace />} />
            <Route path="/profile/:userId" element={<ProfileRedirect />} />

            {DevUI ? (
              <Route
                path="/dev/ui"
                element={
                  <Suspense fallback={null}>
                    <DevUI />
                  </Suspense>
                }
              />
            ) : null}

            <Route element={<ShellGate />}>
              <Route path="/" element={<HomeIndex />} />
              <Route path="/ask" element={<AskStub />} />
              <Route path="/add" element={<AddStub />} />
              <Route path="/add/qr" element={<AddQrStub />} />
              <Route path="/add/scan" element={<AddScanStub />} />
              <Route path="/me" element={<ProfileStub />} />
              <Route path="/me/account" element={<AccountStub />} />
              <Route path="/me/stake" element={<StakeStub />} />
              <Route path="/me/open" element={<OpenStub />} />
              <Route path="/me/history" element={<HistoryStub />} />
              <Route path="/me/help" element={<HelpStub />} />
              <Route path="/people" element={<PeopleStub />} />
              <Route path="/people/:ring" element={<PeopleStub />} />
              <Route path="/person/:id" element={<PersonStub />} />
              <Route path="/collection/:id" element={<CollectionPage />} />
              <Route path="/support" element={<SupportChatPage />} />
              <Route path="/matches/*" element={<RetiredFeaturePage />} />
              <Route path="/skills/*" element={<RetiredFeaturePage />} />
              <Route path="/needs/*" element={<RetiredFeaturePage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </TelegramBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
