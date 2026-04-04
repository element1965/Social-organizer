import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Bell, BellOff, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';

const NATIVE_TOKEN_KEY = 'fcm_push_token';

type PermStatus = 'checking' | 'granted' | 'prompt' | 'denied';

/**
 * On native Android:
 * - Blocks the app with a full-screen gate until push notifications are enabled.
 * - If already granted — initializes FCM listeners silently.
 * - If denied — shows instructions to enable in system settings.
 *
 * Must be rendered inside BrowserRouter and trpc.Provider.
 */
export function NativePushBootstrap() {
  const isNative = Capacitor.isNativePlatform();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const listenersSet = useRef(false);
  const registerNativeMutation = trpc.push.registerNativeToken.useMutation();

  const [permStatus, setPermStatus] = useState<PermStatus>('checking');
  const [requesting, setRequesting] = useState(false);

  // Set up FCM listeners (once per session)
  useEffect(() => {
    if (!isNative || !isAuthenticated || listenersSet.current) return;
    listenersSet.current = true;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const regListener = await PushNotifications.addListener('registration', (token) => {
          const fcmToken = token.value;
          localStorage.setItem(NATIVE_TOKEN_KEY, fcmToken);
          setPermStatus('granted');
          registerNativeMutation.mutate({ token: fcmToken, platform: 'android' });
        });

        const errListener = await PushNotifications.addListener('registrationError', (err) => {
          console.error('[NativePush] FCM registration error:', err);
        });

        const actionListener = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (event) => {
            const url = event.notification.data?.url;
            if (url && typeof url === 'string') {
              const path = url.replace(/^https?:\/\/[^/]+/, '');
              if (path) navigate(path);
            }
          },
        );

        cleanup = () => {
          regListener.remove();
          errListener.remove();
          actionListener.remove();
        };

        // Check current permission state
        const savedToken = localStorage.getItem(NATIVE_TOKEN_KEY);
        const perm = await PushNotifications.checkPermissions();

        if (perm.receive === 'granted' || savedToken) {
          setPermStatus('granted');
          // Re-register to keep token fresh
          await PushNotifications.register();
        } else if (perm.receive === 'denied') {
          setPermStatus('denied');
        } else {
          // 'prompt' or 'prompt-with-rationale' — show the gate
          setPermStatus('prompt');
        }
      } catch (err) {
        console.error('[NativePush] Init failed:', err);
        // Don't block the app on init errors
        setPermStatus('granted');
      }
    })();

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, isAuthenticated]);

  // Reset when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      listenersSet.current = false;
      setPermStatus('checking');
    }
  }, [isAuthenticated]);

  const handleRequestPermission = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const result = await PushNotifications.requestPermissions();
      if (result.receive === 'granted') {
        await PushNotifications.register();
        // permStatus will be set to 'granted' via the 'registration' listener
      } else {
        setPermStatus('denied');
      }
    } catch (err) {
      console.error('[NativePush] requestPermissions failed:', err);
    } finally {
      setRequesting(false);
    }
  };

  // Not native or not authenticated — nothing to render
  if (!isNative || !isAuthenticated) return null;

  // Still checking — show spinner to avoid flash
  if (permStatus === 'checking') {
    return (
      <div className="fixed inset-0 z-[200] bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Granted — render nothing, app works normally
  if (permStatus === 'granted') return null;

  // Gate: prompt or denied
  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-b from-blue-950 to-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center">

        {permStatus === 'prompt' && (
          <>
            <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center mb-6">
              <Bell className="w-10 h-10 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">
              Включи уведомления
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-8">
              Social Organizer работает через уведомления — именно так ты узнаёшь о новых сборах в твоей сети.
              Без уведомлений приложение теряет смысл.
            </p>
            <button
              onClick={handleRequestPermission}
              disabled={requesting}
              className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-base rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-3"
            >
              {requesting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
              {requesting ? 'Запрашиваем...' : 'Включить уведомления'}
            </button>
          </>
        )}

        {permStatus === 'denied' && (
          <>
            <div className="w-20 h-20 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center mb-6">
              <BellOff className="w-10 h-10 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">
              Уведомления отключены
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed mb-2">
              Ты запретил уведомления. Чтобы продолжить, включи их вручную:
            </p>
            <div className="w-full bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-8 text-left space-y-2">
              <p className="text-gray-300 text-sm flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">1.</span>
                Открой <strong className="text-white">Настройки</strong> телефона
              </p>
              <p className="text-gray-300 text-sm flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">2.</span>
                Перейди в <strong className="text-white">Приложения → Social Organizer</strong>
              </p>
              <p className="text-gray-300 text-sm flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">3.</span>
                Включи <strong className="text-white">Уведомления</strong>
              </p>
              <p className="text-gray-300 text-sm flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">4.</span>
                Вернись в приложение
              </p>
            </div>
            <button
              onClick={handleRequestPermission}
              disabled={requesting}
              className="w-full py-4 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white font-semibold text-sm rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mb-3"
            >
              <Settings className="w-4 h-4" />
              Проверить снова
            </button>
            <p className="text-gray-600 text-xs">
              После включения уведомлений нажми «Проверить снова»
            </p>
          </>
        )}

      </div>
    </div>
  );
}
