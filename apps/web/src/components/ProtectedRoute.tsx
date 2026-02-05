import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const location = useLocation();
  const { data: me, isLoading } = trpc.user.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    // Preserve current path as redirect so user returns after login
    const redirectPath = location.pathname + location.search;
    const target = redirectPath !== '/' ? `/welcome?redirect=${encodeURIComponent(redirectPath)}` : '/welcome';
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

  // Redirect to onboarding if not completed (except if already on onboarding page)
  if (me && !me.onboardingCompleted && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
