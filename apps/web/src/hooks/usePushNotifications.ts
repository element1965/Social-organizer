import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { trpc } from '../lib/trpc';
import { raiseActionError } from '../lib/errors';
import { registerServiceWorker } from '../lib/serviceWorker';
import { attachNativePush, confirmedNativeToken, optInNativePush, optOutNativePush, subscribeNativePush } from '../lib/nativePush';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * The push switch in Profile. Native: registration is owned by lib/nativePush.ts and the switch shows the
 * token the server confirmed for this account, so leaving and reopening Profile during an opt-in shows the
 * real state, never a token the server has not accepted. A failed opt-in is told. Web: the browser
 * subscription, saved to the server before the switch turns on.
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [webSubscribed, setWebSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const utils = trpc.useUtils();
  const nativeOn = useSyncExternalStore(subscribeNativePush, () => confirmedNativeToken() !== null, () => false);
  const isSubscribed = isNative ? nativeOn : webSubscribed;

  const { data: vapid } = trpc.push.vapidPublicKey.useQuery(undefined, {
    enabled: !isNative,
  });
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();
  const unregisterNativeMutation = trpc.push.unregisterNativeToken.useMutation();

  const registerNative = useCallback(
    (token: string, platform: string, account: string) =>
      utils.client.push.registerNativeToken.mutate({ token, platform }, { context: { account } }),
    [utils],
  );

  // --- Native (Capacitor) ---
  useEffect(() => {
    if (!isNative) return;
    void attachNativePush(registerNative);
    void (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const permResult = await PushNotifications.checkPermissions();
      setIsSupported(permResult.receive !== 'denied');
    })();
  }, [isNative, registerNative]);

  // --- Web Push ---
  useEffect(() => {
    if (isNative) return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (!supported) return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setWebSubscribed(!!sub);
      });
    });
  }, [isNative]);

  const subscribe = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isNative) {
        // Counts only once the server has the token; a failure (also a refused native register()) is told
        try {
          await optInNativePush(registerNative);
        } catch (error) {
          console.error('[Push] Native opt-in failed:', error);
          raiseActionError(error);
        }
      } else {
        if (!vapid?.key) {
          setLoading(false);
          return;
        }
        const reg = await registerServiceWorker({ force: true });
        if (!reg) throw new Error('Service worker is unavailable');
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setLoading(false);
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.key) as BufferSource,
        });

        const json = sub.toJSON();
        await subscribeMutation.mutateAsync({
          endpoint: sub.endpoint,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        });

        setWebSubscribed(true);
      }
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isNative, vapid?.key, loading, subscribeMutation, registerNative]);

  const unsubscribe = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isNative) {
        await optOutNativePush((token) => unregisterNativeMutation.mutateAsync({ token }));
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
        setWebSubscribed(false);
      }
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isNative, loading, unsubscribeMutation, unregisterNativeMutation]);

  return { isSupported, isSubscribed, subscribe, unsubscribe, loading };
}
