import { Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { safePath } from './onboarding/flow';

const isNativeApp = Capacitor.isNativePlatform();

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const location = useLocation();
  const { isLoading, error } = trpc.user.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });
  // Only a rejected token ends the session. Network/5xx (e.g. hosting down) must not log the
  // user out: during the Railway outage 23–25.09.2026 every app open wiped the session.
  const isError = error?.data?.code === 'UNAUTHORIZED';

  // Clear stale demo tokens — demo mode is disabled
  if (localStorage.getItem('accessToken') === 'demo-token') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    window.location.href = '/?from=demo';
    return null;
  }

  // The server rejected a stored session (auth.html №21): "Sign in again", then back to where the person was.
  // The redirect is sanitised again where it is followed (onboarding/flow.ts safePath).
  if (isAuthenticated && isError) {
    logout();
    const back = safePath(location.pathname + location.search);
    const target = back && back !== '/' ? `/login?reason=expired&redirect=${encodeURIComponent(back)}` : '/login?reason=expired';
    return <Navigate to={target} replace />;
  }

  if (!isAuthenticated) {
    // Preserve current path as redirect so user returns after login
    const redirectPath = location.pathname + location.search;
    if (isNativeApp) {
      const target = redirectPath !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login';
      return <Navigate to={target} replace />;
    }
    const target = redirectPath !== '/dashboard' ? `/?redirect=${encodeURIComponent(redirectPath)}` : '/';
    return <Navigate to={target} replace />;
  }

  // Wait for user data to load
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
