import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { trpc } from '../lib/trpc';

const NATIVE_TOKEN_KEY = 'fcm_push_token';

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

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const nativeInitDone = useRef(false);

  const { data: vapid } = trpc.push.vapidPublicKey.useQuery(undefined, {
    enabled: !isNative,
  });
  const subscribeMutation = trpc.push.subscribe.useMutation();
  const unsubscribeMutation = trpc.push.unsubscribe.useMutation();
  const registerNativeMutation = trpc.push.registerNativeToken.useMutation();
  const unregisterNativeMutation = trpc.push.unregisterNativeToken.useMutation();

  // --- Native (Capacitor) ---
  useEffect(() => {
    if (!isNative || nativeInitDone.current) return;
    nativeInitDone.current = true;

    let cleanup: (() => void) | undefined;

    (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const permResult = await PushNotifications.checkPermissions();
      const supported = permResult.receive !== 'denied';
      setIsSupported(supported);

      const savedToken = localStorage.getItem(NATIVE_TOKEN_KEY);
      if (savedToken) {
        setIsSubscribed(true);
        // Re-register to keep token fresh
        registerNativeMutation.mutate({ token: savedToken, platform: 'android' });
      }

      // Listen for token refresh
      const regListener = await PushNotifications.addListener('registration', (token) => {
        const fcmToken = token.value;
        localStorage.setItem(NATIVE_TOKEN_KEY, fcmToken);
        setIsSubscribed(true);
        registerNativeMutation.mutate({ token: fcmToken, platform: 'android' });
      });

      const errListener = await PushNotifications.addListener('registrationError', (err) => {
        console.error('[FCM] Registration error:', err);
        setIsSubscribed(false);
      });

      // Handle notification tap → navigate to URL
      const actionListener = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (notification) => {
          const url = notification.notification.data?.url;
          if (url && typeof url === 'string') {
            // Navigate within the WebView
            const path = url.replace(/^https?:\/\/[^/]+/, '');
            if (path) window.location.href = path;
          }
        },
      );

      cleanup = () => {
        regListener.remove();
        errListener.remove();
        actionListener.remove();
      };
    })();

    return () => cleanup?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative]);

  // --- Web Push ---
  useEffect(() => {
    if (isNative) return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (!supported) return;

    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, [isNative]);

  const subscribe = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isNative) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const permResult = await PushNotifications.requestPermissions();
        if (permResult.receive !== 'granted') {
          setLoading(false);
          return;
        }
        await PushNotifications.register();
        // Token will arrive via 'registration' listener
      } else {
        if (!vapid?.key) {
          setLoading(false);
          return;
        }
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setLoading(false);
          return;
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.key),
        });

        const json = sub.toJSON();
        await subscribeMutation.mutateAsync({
          endpoint: sub.endpoint,
          p256dh: json.keys!.p256dh!,
          auth: json.keys!.auth!,
        });

        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isNative, vapid?.key, loading, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isNative) {
        const token = localStorage.getItem(NATIVE_TOKEN_KEY);
        if (token) {
          await unregisterNativeMutation.mutateAsync({ token });
          localStorage.removeItem(NATIVE_TOKEN_KEY);
        }
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.unregister();
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await unsubscribeMutation.mutateAsync({ endpoint: sub.endpoint });
          await sub.unsubscribe();
        }
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isNative, loading, unsubscribeMutation, unregisterNativeMutation]);

  return { isSupported, isSubscribed, subscribe, unsubscribe, loading };
}
