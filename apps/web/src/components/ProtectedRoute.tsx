import { Navigate, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';

const isNativeApp = Capacitor.isNativePlatform();

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const location = useLocation();
  const { data: me, isLoading, isError } = trpc.user.me.useQuery(undefined, {
    enabled: isAuthenticated,
    retry: 1,
  });

  // Clear stale demo tokens — demo mode is disabled
  if (localStorage.getItem('accessToken') === 'demo-token') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    window.location.href = '/?from=demo';
    return null;
  }

  // Stale/expired token — clear auth and redirect
  if (isAuthenticated && isError) {
    logout();
    const redirectPath = location.pathname + location.search;
    if (isNativeApp) {
      const target = redirectPath !== '/dashboard' ? `/login?redirect=${encodeURIComponent(redirectPath)}` : '/login';
      return <Navigate to={target} replace />;
    }
    const target = redirectPath !== '/dashboard' ? `/?redirect=${encodeURIComponent(redirectPath)}` : '/';
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
