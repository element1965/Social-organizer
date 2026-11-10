import { useSyncExternalStore } from 'react';

/**
 * "No connection" state. The app is offline when the browser says so (navigator.onLine === false) or when a
 * request could not reach the server at all (a network error, not an HTTP 4xx/5xx answer: any answer proves
 * the server is reachable). While unreachable, /health is probed so the app notices the connection coming back
 * even when the browser never fires `online` (a server outage, a captive network).
 */

const PROBE_INTERVAL_MS = 15_000;
const PROBE_TIMEOUT_MS = 5_000;
const PROBE_RETRY_DELAY_MS = 1_000;

let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
let unreachable = false;
let probeTimer: number | null = null;
const listeners = new Set<() => void>();
const recoveryListeners = new Set<() => void>();

export function isOffline(): boolean {
  return browserOffline || unreachable;
}

function emit(wasOffline: boolean) {
  const now = isOffline();
  if (now === wasOffline) return;
  listeners.forEach((listener) => listener());
  if (!now) recoveryListeners.forEach((listener) => listener());
  syncProbe();
}

function syncProbe() {
  if (isOffline() && probeTimer === null && typeof window !== 'undefined') {
    probeTimer = window.setInterval(() => void checkConnection(), PROBE_INTERVAL_MS);
  } else if (!isOffline() && probeTimer !== null) {
    window.clearInterval(probeTimer);
    probeTimer = null;
  }
}

/** A request got any answer from the server. */
export function reportReachable() {
  if (!unreachable && !browserOffline) return;
  const was = isOffline();
  unreachable = false;
  browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  emit(was);
}

/**
 * A request failed before any answer. One failed fetch proves little (iOS rejects in-flight requests on
 * background/resume with "Load failed", an ad blocker or an upload reset does the same), so the state only
 * flips when a /health probe also fails.
 */
export function reportUnreachable() {
  if (unreachable) return;
  void checkConnection();
}

/** True for the error fetch() throws when there is no network. Aborts and HTTP errors are not network failures. */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

let probing: Promise<boolean> | null = null;

async function probeOnce(): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch('/health', { cache: 'no-store', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/** One probe at a time for all callers; a failed attempt is retried once before it counts. */
function probe(): Promise<boolean> {
  if (probing) return probing;
  probing = (async () => {
    if (await probeOnce()) return true;
    await new Promise((resolve) => window.setTimeout(resolve, PROBE_RETRY_DELAY_MS));
    return probeOnce();
  })().finally(() => {
    probing = null;
  });
  return probing;
}

/** Ask the server directly. Resolves true when it answers; updates the state either way. */
export async function checkConnection(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const ok = await probe();
  const was = isOffline();
  if (ok) {
    unreachable = false;
    browserOffline = false;
  } else {
    unreachable = true;
  }
  emit(was);
  return ok;
}

/** Runs once each time the app goes from offline to online. */
export function onRecovery(listener: () => void): () => void {
  recoveryListeners.add(listener);
  return () => recoveryListeners.delete(listener);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-render when the connection state changes. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false);
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    const was = isOffline();
    browserOffline = true;
    emit(was);
  });
  window.addEventListener('online', () => {
    // The browser says the network is back; confirm with the server before refreshing anything.
    // Until then the state stays as it was.
    void checkConnection();
  });
  syncProbe();
}
