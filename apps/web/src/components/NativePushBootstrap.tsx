import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Bell } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';

const NATIVE_TOKEN_KEY = 'fcm_push_token';
// The person chose "Not now" or declined the system prompt: never ask again on start (SO-45)
const GATE_SKIPPED_KEY = 'push_gate_skipped';

function gateSkipped(): boolean {
  try { return localStorage.getItem(GATE_SKIPPED_KEY) === '1'; } catch { return false; }
}
function skipGate() {
  try { localStorage.setItem(GATE_SKIPPED_KEY, '1'); } catch { /* storage unavailable */ }
}

type PermStatus = 'checking' | 'hidden' | 'prompt';

/**
 * Native push bootstrap.
 * - iOS: push is OPTIONAL (App Store guideline 4.5.4). Never blocks the app —
 *   listeners are set up silently and the gate is never shown. Users opt in via Settings.
 * - Android: offers push once on a full-screen screen with "Not now". Declining never blocks the app:
 *   events stay in the in-app journal and push can be turned on later in Settings (SO-45).
 *
 * Must be rendered inside BrowserRouter and trpc.Provider.
 */
export function NativePushBootstrap() {
  // Push bootstrap runs on Android only. On iOS push is optional (App Store 4.5.4)
  // and must never block the app — we don't init it here and never render a
  // spinner/gate, which previously caused an infinite loading screen on iPad
  // after a full-page reload (e.g. returning from Sign in with Apple).
  const gateAllowed = Capacitor.getPlatform() === 'android';
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listenersSet = useRef(false);
  const registerNativeMutation = trpc.push.registerNativeToken.useMutation();

  const [permStatus, setPermStatus] = useState<PermStatus>('checking');
  const [requesting, setRequesting] = useState(false);

  // Set up FCM listeners (once per session) — Android only
  useEffect(() => {
    if (!gateAllowed || !isAuthenticated || listenersSet.current) return;
    listenersSet.current = true;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const regListener = await PushNotifications.addListener('registration', (token) => {
          const fcmToken = token.value;
          localStorage.setItem(NATIVE_TOKEN_KEY, fcmToken);
          setPermStatus('hidden');
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
              // The app may resume on the same page: reload its data so the change behind the push is visible
              queryClient.invalidateQueries();
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
          setPermStatus('hidden');
          // Re-register to keep token fresh
          await PushNotifications.register();
        } else if (perm.receive === 'denied' || gateSkipped()) {
          // Declined or postponed: the app works without push
          setPermStatus('hidden');
        } else {
          // 'prompt' or 'prompt-with-rationale' — offer push once (Android only)
          setPermStatus('prompt');
        }
      } catch (err) {
        console.error('[NativePush] Init failed:', err);
        // Don't block the app on init errors
        setPermStatus('hidden');
      }
    })();

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateAllowed, isAuthenticated]);

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
        // permStatus will be set to 'hidden' via the 'registration' listener
      } else {
        skipGate();
        setPermStatus('hidden');
      }
    } catch (err) {
      console.error('[NativePush] requestPermissions failed:', err);
    } finally {
      setRequesting(false);
    }
  };

  // Non-Android (iOS/web) or not authenticated — never render anything.
  // Critically, iOS must NOT show the checking spinner: a hung push init would
  // otherwise leave an infinite full-screen loading overlay after login.
  if (!gateAllowed || !isAuthenticated) return null;

  // Still checking — show spinner to avoid flash (Android only)
  if (permStatus === 'checking') {
    return (
      <div className="fixed inset-0 z-[200] bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Granted, declined or postponed — render nothing, app works normally
  if (permStatus === 'hidden') return null;

  // Offer push once (Android only)
  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-b from-blue-950 to-gray-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center">

        <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500 flex items-center justify-center mb-6">
          <Bell className="w-10 h-10 text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">
          Включить уведомления?
        </h1>
        <p className="text-gray-400 text-sm leading-relaxed mb-8">
          Так вы сразу узнаете о заявках и сборах в вашей сети. Без уведомлений всё это видно
          в разделе «Уведомления», а включить их можно позже в настройках.
        </p>
        <button
          onClick={handleRequestPermission}
          disabled={requesting}
          className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-base rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-3 mb-3"
        >
          {requesting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Bell className="w-5 h-5" />
          )}
          {requesting ? 'Запрашиваем...' : 'Включить уведомления'}
        </button>
        <button
          onClick={() => { skipGate(); setPermStatus('hidden'); }}
          disabled={requesting}
          className="w-full py-3 text-gray-300 hover:text-white font-semibold text-sm rounded-2xl transition-colors disabled:opacity-60"
        >
          Не сейчас
        </button>
      </div>
    </div>
  );
}
