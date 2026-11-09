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
  HelpStub,
  HistoryStub,
  PersonStub,
  ProfileRedirect,
  ProfileStub,
  StakeStub,
} from './components/ui2/stubs';
import { useAuth } from './hooks/useAuth';
import { afterSignInPath, readPendingInvite, safeInviteToken, setPendingInvite } from './components/onboarding/flow';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';
import { AskPage } from './pages/AskPage';
import { CollectionPage } from './pages/CollectionPage';
import { OpenCollectionsPage } from './pages/OpenCollectionsPage';
import { RetiredFeaturePage } from './pages/RetiredFeaturePage';
import { InvitePage } from './pages/InvitePage';
import { IntroPage } from './pages/IntroPage';
import { SeedPage } from './pages/SeedPage';
import { SettingsPage } from './pages/SettingsPage';
import { SosLandingPage } from './pages/SosLandingPage';
import { SupportChatPage } from './pages/SupportChatPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { DeleteAccountPage } from './pages/DeleteAccountPage';
import { HowPage } from './pages/HowPage';
import { GetRedirect, RedirectHome } from './components/site/redirects';
import { GoogleCallbackPage } from './pages/GoogleCallbackPage';
import { AppleCallbackPage } from './pages/AppleCallbackPage';
import { CirclePage } from './pages/CirclePage';
import { PeoplePage } from './pages/PeoplePage';
const AddPage = lazy(() => import('./pages/AddPage').then((module) => ({ default: module.AddPage })));
const QrPage = lazy(() => import('./pages/QrPage').then((module) => ({ default: module.QrPage })));
const ScanPage = lazy(() => import('./pages/ScanPage').then((module) => ({ default: module.ScanPage })));

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
          const pendingInvite = safeInviteToken(params.get('inv')) || readPendingInvite();
          // Keep pendingInviteToken until InvitePage accepts it.
          if (pendingInvite) setPendingInvite(pendingInvite);
          // A new account goes through the intro first (components/onboarding/flow.ts)
          navigate(afterSignInPath(params.get('isNew') === '1', pendingInvite ? `/invite/${pendingInvite}` : null), { replace: true });
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

  if (!isAuthenticated) return <LandingPage />;
  return <CirclePage />;
}

const INVITE_REDIRECT_KEY = 'so.inviteRedirected';
let inviteRedirectClaim: string | null = null;
let inviteRedirectStored = false;

function inviteRedirectSeen(token: string): boolean {
  try {
    return sessionStorage.getItem(INVITE_REDIRECT_KEY) === token;
  } catch {
    return inviteRedirectStored && inviteRedirectClaim === token;
  }
}

/** One redirect per token per tab. A second pass renders the shell instead of looping. */
function InviteRedirect({ token }: { token: string }) {
  useEffect(() => {
    inviteRedirectClaim = token;
    inviteRedirectStored = true;
    try {
      sessionStorage.setItem(INVITE_REDIRECT_KEY, token);
    } catch {
      /* private mode: the module flag above is the record */
    }
  }, [token]);
  return <Navigate to={`/invite/${token}`} replace />;
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

  if (location.pathname === '/') {
    const pendingInvite = localStorage.getItem('pendingInviteToken');
    if (pendingInvite) {
      if (inviteRedirectSeen(pendingInvite)) {
        localStorage.removeItem('pendingInviteToken');
      } else {
        inviteRedirectClaim = pendingInvite;
        return <InviteRedirect token={pendingInvite} />;
      }
    }
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
            <Route path="/welcome" element={<RedirectHome />} />
            <Route path="/arvut" element={<RedirectHome />} />
            <Route path="/get" element={<GetRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
            <Route path="/auth/apple/done" element={<AppleCallbackPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/delete-account" element={<DeleteAccountPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
            <Route path="/sos/:collectionId" element={<SosLandingPage />} />
            <Route path="/how" element={<HowPage />} />
            <Route path="/intro" element={<ProtectedRoute><IntroPage /></ProtectedRoute>} />
            <Route path="/seed" element={<ProtectedRoute><SeedPage /></ProtectedRoute>} />

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
              <Route path="/ask" element={<AskPage />} />
              <Route path="/add" element={<Suspense fallback={null}><AddPage /></Suspense>} />
              <Route path="/add/qr" element={<Suspense fallback={null}><QrPage /></Suspense>} />
              <Route path="/add/scan" element={<Suspense fallback={null}><ScanPage /></Suspense>} />
              <Route path="/me" element={<ProfileStub />} />
              <Route path="/me/account" element={<AccountStub />} />
              <Route path="/me/stake" element={<StakeStub />} />
              <Route path="/me/open" element={<OpenCollectionsPage />} />
              <Route path="/me/history" element={<HistoryStub />} />
              <Route path="/me/help" element={<HelpStub />} />
              <Route path="/me/settings" element={<SettingsPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/people/:ring" element={<PeoplePage />} />
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
