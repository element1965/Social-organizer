import { Capacitor } from '@capacitor/core';
import { currentAccount } from './trpc';

/**
 * Native push registration has one owner: this module. It holds the only 'registration' and
 * 'registrationError' listeners; NativePushBootstrap (start-up, the Android offer) and the Profile switch
 * (usePushNotifications) both go through it.
 *
 * A token counts as "on" only once the server has accepted it for the signed-in account: that confirmed
 * token is what is stored (localStorage `fcm_push_token`, with its account) and what the switch shows. A
 * person's own opt-in waits for that confirmation and its failure (a refused native register(), a
 * registration error, the server refusing the token) is told; a routine token refresh at start-up is quiet.
 */

const CONFIRMED_KEY = 'fcm_push_token';
const ACCOUNT_KEY = 'fcm_push_token_account';

type Send = (token: string, platform: string, account: string) => Promise<unknown>;

let send: Send | null = null;
let removeListeners: (() => void) | null = null;
let attaching: Promise<void> | null = null;
let optIn: { resolve: () => void; reject: (error: unknown) => void } | null = null;
const listeners = new Set<() => void>();

function readConfirmed(): { token: string; account: string } | null {
  try {
    const token = localStorage.getItem(CONFIRMED_KEY);
    if (!token) return null;
    // A token stored before this module kept its account belongs to whoever is signed in now
    return { token, account: localStorage.getItem(ACCOUNT_KEY) ?? currentAccount() };
  } catch {
    return null;
  }
}

function writeConfirmed(value: { token: string; account: string } | null) {
  try {
    if (value) {
      localStorage.setItem(CONFIRMED_KEY, value.token);
      localStorage.setItem(ACCOUNT_KEY, value.account);
    } else {
      localStorage.removeItem(CONFIRMED_KEY);
      localStorage.removeItem(ACCOUNT_KEY);
    }
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((listener) => listener());
}

/** The token the server confirmed for the signed-in account, or null. */
export function confirmedNativeToken(): string | null {
  const confirmed = readConfirmed();
  return confirmed && confirmed.account === currentAccount() ? confirmed.token : null;
}

export function subscribeNativePush(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A token arrived from the OS: register it for the account signed in now; confirm it only once the server has it. */
function onToken(token: string) {
  const pending = optIn;
  optIn = null;
  const account = currentAccount();
  if (!send || !account) {
    pending?.reject(new Error('Push registration is not ready'));
    return;
  }
  void send(token, Capacitor.getPlatform(), account).then(
    () => {
      if (currentAccount() === account) writeConfirmed({ token, account });
      pending?.resolve();
    },
    (error: unknown) => {
      // Routine refresh: the confirmed token (if any) stays as it was. An opt-in: the caller tells the person.
      pending?.reject(error);
    },
  );
}

/** Attach the registration listeners once (idempotent). `register` sends a token to the server for an account. */
export function attachNativePush(register: Send): Promise<void> {
  send = register;
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (removeListeners) return Promise.resolve();
  if (attaching) return attaching;
  attaching = (async () => {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const reg = await PushNotifications.addListener('registration', (token) => onToken(token.value));
    const err = await PushNotifications.addListener('registrationError', (error) => {
      console.error('[NativePush] registration error:', error);
      const pending = optIn;
      optIn = null;
      pending?.reject(error);
    });
    removeListeners = () => {
      void reg.remove();
      void err.remove();
    };
  })().finally(() => {
    attaching = null;
  });
  return attaching;
}

/** Signed out: drop the listeners (the next sign-in attaches them again). */
export function detachNativePush() {
  removeListeners?.();
  removeListeners = null;
  optIn?.reject(new Error('Signed out'));
  optIn = null;
}

/** Start-up: ask the OS for the current token; it is registered quietly when it arrives. */
export async function refreshNativeToken() {
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.register();
}

/**
 * The person turns notifications on. Resolves 'on' once the server confirmed the token, 'denied' when the OS
 * permission was not given; rejects with the failure (refused register(), registration error, server error).
 */
export async function optInNativePush(register: Send): Promise<'on' | 'denied'> {
  await attachNativePush(register);
  const { PushNotifications } = await import('@capacitor/push-notifications');
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return 'denied';
  const confirmed = new Promise<void>((resolve, reject) => {
    optIn?.reject(new Error('Replaced by a newer opt-in'));
    optIn = { resolve, reject };
  });
  try {
    await PushNotifications.register();
  } catch (error) {
    optIn = null;
    throw error;
  }
  await confirmed;
  return 'on';
}

/** The person turns notifications off: the server forgets the token first, then the device. */
export async function optOutNativePush(unregister: (token: string) => Promise<unknown>) {
  const token = confirmedNativeToken();
  if (token) await unregister(token);
  writeConfirmed(null);
  const { PushNotifications } = await import('@capacitor/push-notifications');
  await PushNotifications.unregister();
}
