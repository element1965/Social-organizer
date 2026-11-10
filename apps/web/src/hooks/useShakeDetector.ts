import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

/** Linear acceleration (gravity removed) a peak must exceed to count, in m/s². */
export const SHAKE_PEAK = 15;
/** Direction reversals on the dominant axis needed to call it a shake. */
export const SHAKE_REVERSALS = 3;
/** All reversals must fall inside this window. */
export const SHAKE_WINDOW_MS = 800;
/** Quiet period after a shake fires. */
export const SHAKE_COOLDOWN_MS = 2500;
/** Low-pass weight used to estimate gravity per axis. */
const GRAVITY_ALPHA = 0.8;

type MotionPermission = 'unneeded' | 'prompt' | 'granted' | 'denied';

interface MotionEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function motionCtor(): MotionEventCtor | null {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return null;
  return DeviceMotionEvent as unknown as MotionEventCtor;
}

function needsIosPermission(): boolean {
  return typeof motionCtor()?.requestPermission === 'function';
}

/* Tiny shared store so a button anywhere (Add screen) can offer the permission without a context. */
interface ShakeSupport {
  needsPermission: boolean;
}
let support: ShakeSupport = { needsPermission: false };
let requestFn: (() => Promise<void>) | null = null;
const listeners = new Set<() => void>();

function publish(next: ShakeSupport) {
  if (next.needsPermission === support.needsPermission) return;
  support = next;
  listeners.forEach((l) => l());
}

/** Whether a mobile browser still needs a tap to allow motion, plus the function that asks. */
export function useShakePermission() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => support,
    () => support,
  );
  const requestPermission = useCallback(async () => {
    await requestFn?.();
  }, []);
  return { needsPermission: state.needsPermission, requestPermission };
}

/**
 * Calls onShake when the phone is shaken: at least SHAKE_REVERSALS direction reversals on one axis,
 * each with a peak above SHAKE_PEAK, inside SHAKE_WINDOW_MS. Silent while the page is hidden.
 *
 * iOS: inside the native app the first tap anywhere asks for motion access (the WKWebView delegate grants it
 * without a dialog, but WebKit wants a user gesture). In a plain browser nothing is requested automatically,
 * useShakePermission() exposes the button state instead.
 */
export function useShakeDetector(onShake: () => void, enabled = true) {
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return;

    const gravity = [0, 0, 0];
    let permission: MotionPermission = 'unneeded';
    let primed = false;
    let lastSign = [0, 0, 0];
    let reversals: Array<{ t: number; axis: number }> = [];
    let cooldownUntil = 0;
    let listening = false;

    const reset = () => {
      primed = false;
      lastSign = [0, 0, 0];
      reversals = [];
    };

    const onMotion = (event: DeviceMotionEvent) => {
      const now = Date.now();
      if (now < cooldownUntil) return;
      const withG = event.accelerationIncludingGravity;
      const lin = event.acceleration;
      let v: number[];
      if (withG && withG.x != null && withG.y != null && withG.z != null) {
        const raw = [withG.x, withG.y, withG.z];
        if (!primed) {
          raw.forEach((value, i) => {
            gravity[i] = value;
          });
          primed = true;
          return;
        }
        v = raw.map((value, i) => {
          const g = GRAVITY_ALPHA * (gravity[i] ?? value) + (1 - GRAVITY_ALPHA) * value;
          gravity[i] = g;
          return value - g;
        });
      } else if (lin && lin.x != null && lin.y != null && lin.z != null) {
        v = [lin.x, lin.y, lin.z];
      } else {
        return;
      }
      // Only the dominant axis of this sample counts, which ignores a twist or a walking sway.
      let axis = 0;
      for (let i = 1; i < 3; i += 1) if (Math.abs(v[i] ?? 0) > Math.abs(v[axis] ?? 0)) axis = i;
      const value = v[axis] ?? 0;
      if (Math.abs(value) < SHAKE_PEAK) return;
      const sign = value > 0 ? 1 : -1;
      const previous = lastSign[axis] ?? 0;
      if (previous !== 0 && sign !== previous) {
        reversals.push({ t: now, axis });
      }
      lastSign[axis] = sign;
      reversals = reversals.filter((r) => now - r.t <= SHAKE_WINDOW_MS);
      if (reversals.filter((r) => r.axis === axis).length >= SHAKE_REVERSALS) {
        cooldownUntil = now + SHAKE_COOLDOWN_MS;
        reset();
        onShakeRef.current();
      }
    };

    const start = () => {
      if (listening || document.visibilityState === 'hidden') return;
      listening = true;
      reset();
      window.addEventListener('devicemotion', onMotion);
    };
    const stop = () => {
      if (!listening) return;
      listening = false;
      window.removeEventListener('devicemotion', onMotion);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (permission === 'unneeded' || permission === 'granted') start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const request = async () => {
      const ctor = motionCtor();
      if (!ctor?.requestPermission) return;
      try {
        const result = await ctor.requestPermission();
        permission = result === 'granted' ? 'granted' : 'denied';
      } catch {
        // Not a gesture or rejected: stay in "prompt" so the next tap retries.
        permission = 'prompt';
      }
      if (permission === 'granted') {
        publish({ needsPermission: false });
        start();
      }
    };

    let removeTap: (() => void) | null = null;

    if (!needsIosPermission()) {
      permission = 'unneeded';
      publish({ needsPermission: false });
      start();
    } else if (Capacitor.isNativePlatform()) {
      permission = 'prompt';
      publish({ needsPermission: false });
      const onTap = () => {
        if (permission === 'granted') return;
        void request().then(() => {
          if (permission === 'granted') removeTap?.();
        });
      };
      document.addEventListener('pointerup', onTap, true);
      document.addEventListener('touchend', onTap, true);
      removeTap = () => {
        document.removeEventListener('pointerup', onTap, true);
        document.removeEventListener('touchend', onTap, true);
      };
    } else {
      permission = 'prompt';
      publish({ needsPermission: true });
      requestFn = request;
    }

    return () => {
      stop();
      removeTap?.();
      document.removeEventListener('visibilitychange', onVisibility);
      requestFn = null;
      publish({ needsPermission: false });
    };
  }, [enabled]);
}
