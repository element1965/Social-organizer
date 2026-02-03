import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';

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
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-gray-950 flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center">
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

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
            <div className="relative flex justify-center"><span className="bg-gray-950 px-3 text-gray-500 text-xs">{t('login.or', 'или')}</span></div>
          </div>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
            size="lg"
            onClick={() => {
              login('demo-token', 'demo-refresh', 'demo-user');
              // Full reload to reinitialize tRPC client with demoLink
              window.location.href = '/';
            }}
            disabled={loading}
          >
            {t('login.demo', 'Демо-вход без регистрации')}
          </Button>
        </div>
      </div>
    </div>
  );
}
