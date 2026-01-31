import { useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';

const LazyPlanetScene = lazy(() =>
  import('@so/graph-3d').then((m) => ({ default: m.PlanetScene })),
);

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const loginMutation = trpc.auth.loginWithPlatform.useMutation({
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.userId);
      navigate('/onboarding');
    },
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = (platform: 'FACEBOOK' | 'TELEGRAM' | 'APPLE' | 'GOOGLE') => {
    setLoading(true);
    const stubToken = `stub-${platform}-${Date.now()}`;
    loginMutation.mutate(
      { platform, platformToken: stubToken },
      { onSettled: () => setLoading(false) },
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-gray-950 flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* 3D-планета на фоне */}
      <div className="absolute inset-0 opacity-60">
        <Suspense fallback={null}>
          <LazyPlanetScene />
        </Suspense>
      </div>

      {/* Контент поверх 3D */}
      <div className="relative z-10 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-white mb-2">Social Organizer</h1>
        <p className="text-gray-400 text-sm mb-10 text-center max-w-xs">
          {t('login.subtitle', 'Координация помощи через доверенные связи')}
        </p>
        <div className="w-full max-w-xs space-y-3">
          <Button className="w-full bg-[#1877F2] hover:bg-[#1565C0] text-white" size="lg" onClick={() => handleLogin('FACEBOOK')} disabled={loading}>
            Facebook
          </Button>
          <Button className="w-full bg-[#0088cc] hover:bg-[#006daa] text-white" size="lg" onClick={() => handleLogin('TELEGRAM')} disabled={loading}>
            Telegram
          </Button>
          <Button className="w-full bg-black hover:bg-gray-800 text-white border border-gray-700" size="lg" onClick={() => handleLogin('APPLE')} disabled={loading}>
            Apple
          </Button>
          <Button className="w-full bg-white hover:bg-gray-100 text-gray-900 border border-gray-300" size="lg" onClick={() => handleLogin('GOOGLE')} disabled={loading}>
            Google
          </Button>
        </div>
      </div>
    </div>
  );
}
