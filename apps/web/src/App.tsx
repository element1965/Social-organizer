import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { trpc, getTrpcClient } from './lib/trpc';
import { TelegramBootstrap } from './components/TelegramBootstrap';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ShakeProvider } from './components/shake/ShakeProvider';
import { NativePushBootstrap } from './components/NativePushBootstrap';
import { AppShell } from './components/ui2/AppShell';
import { AppLoader } from './components/ui2/AppLoader';
import { ProfileRedirect } from './components/ui2/stubs';
import { useAuth } from './hooks/useAuth';
import { afterSignInPath, readPendingInvite, safeInviteToken, safeMasked, safePath, setPendingInvite } from './components/onboarding/flow';
import { LandingPage } from './pages/LandingPage';
import { GetRedirect, RedirectHome } from './components/site/redirects';
import { HomeGate, OfflineRouteBoundary, PeopleGate, PersonGate } from './components/offline/gates';
import { onRecovery } from './lib/connectivity';

/** Named-export pages, each its own chunk. The guest landing stays in the entry chunk. */
function lazyPage<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() =>
    load()
      .catch(() => load())
      .then((module) => ({ default: module[name] as ComponentType })),
  );
}

/** Light stand-in while a route chunk loads. The shell stays put; public pages cover the viewport. */
function RouteFallback({ full = false }: { full?: boolean }) {
  const { t } = useTranslation();
  // The full-page fallback is the start-up loader, the same picture as the one in index.html
  if (full) return <AppLoader />;
  return (
    <div className="grid min-h-[40vh] place-items-center" role="status">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-care" aria-hidden />
    </div>
  );
}

function PublicRoutes() {
  return (
    <Suspense fallback={<RouteFallback full />}>
      <Outlet />
    </Suspense>
  );
}

function ShellRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <OfflineRouteBoundary>
        <Outlet />
      </OfflineRouteBoundary>
    </Suspense>
  );
}

/** Warm the Circle chunk as soon as a session exists, so the signed-in home is ready. */
function PrefetchCircle() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  useEffect(() => {
    if (isAuthenticated) void loadCircle();
  }, [isAuthenticated]);
  return null;
}

const loadCircle = () => import('./pages/CirclePage');
const CirclePage = lazyPage(loadCircle, 'CirclePage');
const LoginPage = lazyPage(() => import('./pages/LoginPage'), 'LoginPage');
const AskPage = lazyPage(() => import('./pages/AskPage'), 'AskPage');
const CollectionPage = lazyPage(() => import('./pages/CollectionPage'), 'CollectionPage');
const OpenCollectionsPage = lazyPage(() => import('./pages/OpenCollectionsPage'), 'OpenCollectionsPage');
const InvitePage = lazyPage(() => import('./pages/InvitePage'), 'InvitePage');
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'), 'ProfilePage');
const AccountPage = lazyPage(() => import('./pages/AccountPage'), 'AccountPage');
const StakePage = lazyPage(() => import('./pages/StakePage'), 'StakePage');
const HistoryPage = lazyPage(() => import('./pages/HistoryPage'), 'HistoryPage');
const HelpPage = lazyPage(() => import('./pages/HelpPage'), 'HelpPage');
const PersonPage = lazyPage(() => import('./pages/PersonPage'), 'PersonPage');
const AdminStatsPage = lazyPage(() => import('./pages/AdminStatsPage'), 'AdminStatsPage');
const AssistantPage = lazyPage(() => import('./pages/AssistantPage'), 'AssistantPage');
const BroadcastScreen = lazyPage(() => import('./pages/BroadcastScreen'), 'BroadcastScreen');
const FaqScreen = lazyPage(() => import('./pages/FaqScreen'), 'FaqScreen');
const IntroPage = lazyPage(() => import('./pages/IntroPage'), 'IntroPage');
const SeedPage = lazyPage(() => import('./pages/SeedPage'), 'SeedPage');
const SosLandingPage = lazyPage(() => import('./pages/SosLandingPage'), 'SosLandingPage');
const SupportChatPage = lazyPage(() => import('./pages/SupportChatPage'), 'SupportChatPage');
const PrivacyPage = lazyPage(() => import('./pages/PrivacyPage'), 'PrivacyPage');
const TermsPage = lazyPage(() => import('./pages/TermsPage'), 'TermsPage');
const DeleteAccountPage = lazyPage(() => import('./pages/DeleteAccountPage'), 'DeleteAccountPage');
const HowPage = lazyPage(() => import('./pages/HowPage'), 'HowPage');
const GoogleCallbackPage = lazyPage(() => import('./pages/GoogleCallbackPage'), 'GoogleCallbackPage');
const AppleCallbackPage = lazyPage(() => import('./pages/AppleCallbackPage'), 'AppleCallbackPage');
const PeoplePage = lazyPage(() => import('./pages/PeoplePage'), 'PeoplePage');
const AddPage = lazyPage(() => import('./pages/AddPage'), 'AddPage');
const QrPage = lazyPage(() => import('./pages/QrPage'), 'QrPage');
const ScanPage = lazyPage(() => import('./pages/ScanPage'), 'ScanPage');

const isNativeApp = Capacitor.isNativePlatform();

const DevUI = import.meta.env.DEV
  ? lazy(() => import('./components/ui2/DevUIPage').then((module) => ({ default: module.DevUIPage })))
  : null;

const ModerationPreview = import.meta.env.DEV
  ? lazy(() => import('./pages/ModerationPreviewPage').then((module) => ({ default: module.ModerationPreviewPage })))
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
        const errParams = new URLSearchParams(url.split('?')[1] || '');
        const reason = errParams.get('reason');
        // account_exists may carry the masked e-mail ("an•••@gmail.com"); cancelled is a calm notice, not an error
        const masked = reason === 'account_exists' ? safeMasked(errParams.get('m')) : null;
        const known = reason === 'account_exists' || reason === 'cancelled' ? reason : 'failed';
        navigate(`/login?error=${known}${masked ? `&m=${encodeURIComponent(masked)}` : ''}`, { replace: true });
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
    const inviteParam = safeInviteToken(params.get('invite'));
    if (inviteParam) return <Navigate to={`/invite/${inviteParam}`} replace />;
    const redirectParam = safePath(params.get('redirect'));
    return <Navigate to={redirectParam ? `/login?redirect=${encodeURIComponent(redirectParam)}` : '/login'} replace />;
  }

  if (!isAuthenticated) return <LandingPage />;
  return (
    <HomeGate>
      <CirclePage />
    </HomeGate>
  );
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

  const inviteParam = safeInviteToken(params.get('invite'));
  if (location.pathname === '/' && inviteParam) {
    return <Navigate to={`/invite/${inviteParam}`} replace />;
  }

  if (!isAuthenticated) {
    if (location.pathname === '/') return <Outlet />;
    const redirectPath = location.pathname + location.search;
    if (isNativeApp) return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
    return <Navigate to={`/?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  if (location.pathname === '/') {
    const storedInvite = localStorage.getItem('pendingInviteToken');
    const pendingInvite = safeInviteToken(storedInvite);
    if (storedInvite && !pendingInvite) localStorage.removeItem('pendingInviteToken');
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
    // networkMode 'always': a request without a network fails at once and says so (the offline screens react to it)
    // instead of waiting paused; a mutation then fails visibly rather than firing later on its own.
    defaultOptions: {
      queries: {
        retry: 1,
        // The one retry waits 1–3 s, spread at random, so clients do not all return in the same second
        retryDelay: () => 1000 + Math.random() * 2000,
        refetchOnWindowFocus: false,
        networkMode: 'always',
      },
      mutations: { networkMode: 'always' },
    },
  }));
  const [trpcClient] = useState(() => getTrpcClient());

  // The connection came back (the browser says so, or the server answers again): refresh what is on screen
  // (spread over a few seconds: after an outage every open app comes back at the same moment)
  useEffect(() => onRecovery(() => {
    window.setTimeout(() => void queryClient.invalidateQueries(), Math.random() * 4000);
  }), [queryClient]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TelegramBootstrap>
          <NativePushBootstrap />
          <GoogleAuthDeepLinkHandler />
          <PrefetchCircle />
          <ShakeProvider />
          <Routes>
            <Route path="/welcome" element={<RedirectHome />} />
            <Route path="/arvut" element={<RedirectHome />} />
            <Route path="/get" element={<GetRedirect />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/network" element={<Navigate to="/" replace />} />
            <Route path="/notifications" element={<Navigate to="/" replace />} />
            <Route path="/create" element={<Navigate to="/ask" replace />} />
            <Route path="/settings" element={<Navigate to="/me" replace />} />
            <Route path="/faq" element={<Navigate to="/me/help" replace />} />
            <Route path="/onboarding" element={<Navigate to="/intro" replace />} />
            <Route path="/matches/*" element={<Navigate to="/" replace />} />
            <Route path="/skills/*" element={<Navigate to="/" replace />} />
            <Route path="/needs/*" element={<Navigate to="/" replace />} />
            <Route path="/profile/:userId" element={<ProfileRedirect />} />

            <Route element={<PublicRoutes />}>
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
            </Route>

            {DevUI ? (
              <Route
                path="/dev/ui"
                element={
                  <Suspense fallback={<RouteFallback full />}>
                    <DevUI />
                  </Suspense>
                }
              />
            ) : null}
            {ModerationPreview ? (
              <Route
                path="/dev/moderation"
                element={
                  <Suspense fallback={<RouteFallback full />}>
                    <ModerationPreview />
                  </Suspense>
                }
              />
            ) : null}

            <Route element={<ShellGate />}>
              <Route element={<ShellRoutes />}>
                <Route path="/" element={<HomeIndex />} />
                <Route path="/ask" element={<AskPage />} />
                <Route path="/add" element={<AddPage />} />
                <Route path="/add/qr" element={<QrPage />} />
                <Route path="/add/scan" element={<ScanPage />} />
                <Route path="/me" element={<ProfilePage />} />
                <Route path="/me/account" element={<AccountPage />} />
                <Route path="/me/stake" element={<StakePage />} />
                <Route path="/me/open" element={<OpenCollectionsPage />} />
                <Route path="/me/history" element={<HistoryPage />} />
                <Route path="/me/help" element={<HelpPage />} />
                <Route path="/me/help/faq" element={<FaqScreen />} />
                <Route path="/me/help/assistant" element={<AssistantPage />} />
                <Route path="/me/broadcast" element={<BroadcastScreen />} />
                <Route path="/me/stats" element={<AdminStatsPage />} />
                <Route path="/me/settings" element={<Navigate to="/me" replace />} />
                <Route path="/people" element={<PeopleGate><PeoplePage /></PeopleGate>} />
                <Route path="/people/:ring" element={<PeopleGate><PeoplePage /></PeopleGate>} />
                <Route path="/person/:id" element={<PersonGate><PersonPage /></PersonGate>} />
                <Route path="/collection/:id" element={<CollectionPage />} />
                <Route path="/support" element={<SupportChatPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
          </TelegramBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
