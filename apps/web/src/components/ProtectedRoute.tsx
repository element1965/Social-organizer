import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useOffline } from '../lib/connectivity';
import { safePath } from './onboarding/flow';
import { AppLoader } from './ui2/AppLoader';

const isNativeApp = Capacitor.isNativePlatform();

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const location = useLocation();
  const offline = useOffline();
  const { isLoading, error } = trpc.user.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });
  // Only a rejected token ends the session. Network/5xx (e.g. hosting down) must not log the
  // user out: during the Railway outage 23–25.09.2026 every app open wiped the session.
  const isError = error?.data?.code === 'UNAUTHORIZED';
  // The account behind a stored session was deleted (e.g. on another device): sign out to "Account deleted".
  const isDeleted = error?.data?.code === 'FORBIDDEN' && error.message === 'Account has been deleted';

  // The server rejected a stored session (auth.html №21): "Sign in again", then back to where the person was.
  // The target is fixed once (a ref), and logout() runs in an effect followed by a full load of that target:
  // otherwise the signed-out render of the shell gate would send the person to "/?redirect=" first.
  // The redirect is sanitised again where it is followed (onboarding/flow.ts safePath).
  const expiredTarget = useRef<string | null>(null);
  if (isAuthenticated && isDeleted && expiredTarget.current === null) {
    expiredTarget.current = '/login?deleted=1';
  }
  if (isAuthenticated && isError && expiredTarget.current === null) {
    const back = safePath(location.pathname + location.search);
    expiredTarget.current =
      back && back !== '/' ? `/login?reason=expired&redirect=${encodeURIComponent(back)}` : '/login?reason=expired';
  }
  const expired = expiredTarget.current;
  useEffect(() => {
    if (!expired) return;
    logout();
    window.location.replace(expired);
  }, [expired, logout]);

  if (expired) return null;

  if (!isAuthenticated) {
    // Preserve current path as redirect so user returns after login
    const redirectPath = safePath(location.pathname + location.search) ?? '/dashboard';
    if (isNativeApp) {
      const target = redirectPath !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login';
      return <Navigate to={target} replace />;
    }
    const target = redirectPath !== '/dashboard' ? `/?redirect=${encodeURIComponent(redirectPath)}` : '/';
    return <Navigate to={target} replace />;
  }

  // Wait for user data to load
  // Offline there is nothing to wait for: the saved copy screens take over
  if (isLoading && !offline) {
    return <AppLoader />;
  }

  return <>{children}</>;
}
