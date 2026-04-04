import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';

const NATIVE_TOKEN_KEY = 'fcm_push_token';

/**
 * Globally initializes native (FCM) push notifications when the user is authenticated.
 * - Re-registers saved token on app start to keep it fresh in the backend.
 * - Listens for 'registration' events (token refresh) globally.
 * - Listens for 'pushNotificationActionPerformed' to navigate on notification tap.
 *
 * Must be rendered inside BrowserRouter and trpc.Provider.
 */
export function NativePushBootstrap() {
  const isNative = Capacitor.isNativePlatform();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const initDone = useRef(false);
  const registerNativeMutation = trpc.push.registerNativeToken.useMutation();

  useEffect(() => {
    if (!isNative || !isAuthenticated || initDone.current) return;
    initDone.current = true;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Listen for FCM token (refresh or new registration triggered by register() below)
        const regListener = await PushNotifications.addListener('registration', (token) => {
          const fcmToken = token.value;
          localStorage.setItem(NATIVE_TOKEN_KEY, fcmToken);
          registerNativeMutation.mutate({ token: fcmToken, platform: 'android' });
        });

        const errListener = await PushNotifications.addListener('registrationError', (err) => {
          console.error('[NativePush] FCM registration error:', err);
        });

        // Navigate to URL when user taps a push notification
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

        const savedToken = localStorage.getItem(NATIVE_TOKEN_KEY);
        if (savedToken) {
          // Re-register saved token to keep it fresh in the backend
          registerNativeMutation.mutate({ token: savedToken, platform: 'android' });
          // Also call register() to refresh the token with FCM
          await PushNotifications.register();
        } else {
          // First time: auto-request permission and register
          const permResult = await PushNotifications.requestPermissions();
          if (permResult.receive === 'granted') {
            await PushNotifications.register();
          }
        }
      } catch (err) {
        console.error('[NativePush] Init failed:', err);
      }
    })();

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, isAuthenticated]);

  // Reset initDone when user logs out so it re-initializes on next login
  useEffect(() => {
    if (!isAuthenticated) {
      initDone.current = false;
    }
  }, [isAuthenticated]);

  return null;
}
