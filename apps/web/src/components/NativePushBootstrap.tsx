import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from './ui2/Button';
import { BrandMark } from './ui2/BrandMark';
import { OnboardingFrame, StepText } from './onboarding/OnboardingFrame';

const NATIVE_TOKEN_KEY = 'fcm_push_token';

type PermStatus = 'checking' | 'granted' | 'prompt' | 'denied';

/**
 * Native push bootstrap.
 * - iOS: push is OPTIONAL (App Store guideline 4.5.4). Never blocks the app —
 *   listeners are set up silently and the gate is never shown. Users opt in via Settings.
 * - Android: blocks the app with a full-screen gate until push notifications are enabled.
 *
 * Must be rendered inside BrowserRouter and trpc.Provider.
 */
export function NativePushBootstrap() {
  // Push bootstrap runs on Android only. On iOS push is optional (App Store 4.5.4)
  // and must never block the app — we don't init it here and never render a
  // spinner/gate, which previously caused an infinite loading screen on iPad
  // after a full-page reload (e.g. returning from Sign in with Apple).
  const { t } = useTranslation();
  const gateAllowed = Capacitor.getPlatform() === 'android';
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const listenersSet = useRef(false);
  const registerNativeMutation = trpc.push.registerNativeToken.useMutation();

  const [permStatus, setPermStatus] = useState<PermStatus>('checking');
  const [requesting, setRequesting] = useState(false);
  // "Not now" hides the prompt for this visit. It does not grant, deny, or persist anything.
  const [skipped, setSkipped] = useState(false);

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
        } else if (!gateAllowed) {
          // iOS: push is optional — don't block. Never show the gate.
          setPermStatus('granted');
        } else if (perm.receive === 'denied') {
          setPermStatus('denied');
        } else {
          // 'prompt' or 'prompt-with-rationale' — show the gate (Android only)
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
  }, [gateAllowed, isAuthenticated]);

  // Reset when user logs out
  useEffect(() => {
    if (!isAuthenticated) {
      listenersSet.current = false;
      setPermStatus('checking');
      setSkipped(false);
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

  // Non-Android (iOS/web) or not authenticated — never render anything.
  // Critically, iOS must NOT show the checking spinner: a hung push init would
  // otherwise leave an infinite full-screen loading overlay after login.
  if (!gateAllowed || !isAuthenticated) return null;

  // Still checking — show spinner to avoid flash (Android only)
  if (permStatus === 'checking') {
    return (
      <div className="fixed inset-0 z-[200] grid place-items-center bg-canvas">
        <span className="so-spin h-8 w-8 rounded-full border-2 border-care/40 border-t-care" />
      </div>
    );
  }

  // Granted — render nothing, app works normally
  if (permStatus === 'granted') return null;
  // Prompt can be dismissed for this visit. Denied still blocks, same as before.
  if (permStatus === 'prompt' && skipped) return null;

  const prompt = permStatus === 'prompt';

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-canvas">
      <OnboardingFrame
        centre
        foot={
          <div className="flex w-full flex-col items-center gap-1">
            <Button className="w-full" loading={requesting} onClick={() => void handleRequestPermission()}>
              {prompt
                ? requesting
                  ? t('nativePush.requesting')
                  : t('nativePush.enable')
                : t('nativePush.checkAgain')}
            </Button>
            {prompt ? (
              <Button variant="text" onClick={() => setSkipped(true)}>
                {t('nativePush.notNow')}
              </Button>
            ) : (
              <p className="px-2 pt-2 text-center text-label font-semibold text-ink-subtle">{t('nativePush.checkHint')}</p>
            )}
          </div>
        }
      >
        <div className="mt-8 flex justify-center">
          <BrandMark size={84} />
        </div>
        <StepText centre title={prompt ? t('nativePush.promptTitle') : t('nativePush.deniedTitle')}>
          {prompt ? t('nativePush.promptBody') : t('nativePush.deniedBody')}
        </StepText>
        {prompt ? null : (
          <ol className="mt-5 w-full space-y-2 rounded-xl bg-surface p-4 text-left text-body-s text-ink shadow-card">
            <li className="flex items-start gap-2">
              <span className="font-bold text-care">1.</span>
              <Trans i18nKey="nativePush.step1" components={{ b: <strong className="font-bold text-ink" /> }} />
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-care">2.</span>
              <Trans i18nKey="nativePush.step2" components={{ b: <strong className="font-bold text-ink" /> }} />
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-care">3.</span>
              <Trans i18nKey="nativePush.step3" components={{ b: <strong className="font-bold text-ink" /> }} />
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-care">4.</span>
              {t('nativePush.step4')}
            </li>
          </ol>
        )}
      </OnboardingFrame>
    </div>
  );
}
