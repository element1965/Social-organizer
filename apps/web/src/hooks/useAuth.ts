import { clearCampaign } from '../lib/campaign';
import { clearAskDraft } from '../lib/askDraft';
import { create } from 'zustand';
import { clearLocal, setActiveUser } from '@so/gun-backup';

// Saved-copy writes are refused for anyone but the person signed in right now
setActiveUser(() => localStorage.getItem('userId'));

export type LoginMethod = 'google' | 'apple' | 'telegram' | 'email';
export const LAST_METHOD_KEY = 'so.lastLoginMethod';
export const PENDING_METHOD_KEY = 'so.pendingLoginMethod';

/** Called when a sign-in starts; becomes the "last method" only after the sign-in succeeds. */
export function markLoginMethod(method: LoginMethod) {
  try { localStorage.setItem(PENDING_METHOD_KEY, method); } catch { /* storage unavailable */ }
}

/**
 * Forget everything this device saved about the signed-in person's network (the offline copy, the stats
 * cache and the saved network figure). Fire-and-forget: if the page unloads first, the start-up sweep
 * (main.tsx) finishes the job.
 */
export function wipeSavedCopy() {
  try {
    localStorage.removeItem('so_networkStats');
    localStorage.removeItem('so_networkFigure');
  } catch { /* storage unavailable */ }
  void clearLocal().catch(() => undefined);
}

export function getLastLoginMethod(): LoginMethod | null {
  try {
    const v = localStorage.getItem(LAST_METHOD_KEY);
    return v === 'google' || v === 'apple' || v === 'telegram' || v === 'email' ? v : null;
  } catch {
    return null;
  }
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, userId: string) => void;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuth = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  userId: localStorage.getItem('userId'),
  isAuthenticated: !!localStorage.getItem('accessToken'),

  login: (accessToken, refreshToken, userId) => {
    clearCampaign();
    // Someone else signing in on this device must not inherit the previous person's saved copy.
    // The stored id is read before it is overwritten below.
    const previous = localStorage.getItem('userId');
    if (previous && previous !== userId) wipeSavedCopy();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('userId', userId);
    // Remember only the sign-in method (no account data) for the hint on the sign-in screen (SO-21)
    try {
      const pending = localStorage.getItem(PENDING_METHOD_KEY);
      if (pending) {
        localStorage.setItem(LAST_METHOD_KEY, pending);
        localStorage.removeItem(PENDING_METHOD_KEY);
      }
    } catch { /* storage unavailable */ }
    set({ accessToken, refreshToken, userId, isAuthenticated: true });
  },

  logout: () => {
    wipeSavedCopy();
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userId');
    set({ accessToken: null, refreshToken: null, userId: null, isAuthenticated: false });
  },

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ accessToken, refreshToken });
  },
}));

useAuth.subscribe((state, previous) => {
  if (state.userId !== previous.userId) clearAskDraft(previous.userId);
});

/** The account id inside a token's payload (`sub`, as the API signs it), read locally without verification. */
function tokenSubject(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

/**
 * The account of the session stored on this device right now ('' signed out): the subject of the stored access
 * token, which is what a request will actually carry, else the stored `userId`. The one answer to "which account
 * is this" for request binding (lib/trpc.ts), per-account preference saves (lib/pendingSettings.ts) and the
 * native push token (lib/nativePush.ts); this tab's store follows the same storage through syncAuthFromStorage.
 */
export function storedAccount(): string {
  try {
    const token = localStorage.getItem('accessToken');
    return (token ? tokenSubject(token) : null) ?? localStorage.getItem('userId') ?? '';
  } catch {
    return '';
  }
}

/**
 * Brings this tab's store in line with the session stored on the device, which another tab may have changed
 * (signed out, or signed in as someone else). Account-scoped queries re-key on the new `userId` at once.
 * The three keys are written one by one, so a half-written session (one account's token with another's id) is
 * left alone: the store changes only when the tokens belong to the stored `userId`, or when all three are gone.
 */
export function syncAuthFromStorage(): void {
  let stored: { accessToken: string | null; refreshToken: string | null; userId: string | null };
  try {
    stored = {
      accessToken: localStorage.getItem('accessToken'),
      refreshToken: localStorage.getItem('refreshToken'),
      userId: localStorage.getItem('userId'),
    };
  } catch {
    return;
  }
  const signedOut = !stored.accessToken && !stored.refreshToken && !stored.userId;
  const consistent =
    signedOut ||
    (!!stored.accessToken && !!stored.userId && tokenSubject(stored.accessToken) === stored.userId &&
      (!stored.refreshToken || tokenSubject(stored.refreshToken) === stored.userId));
  // Mid-write: wait for the next storage event
  if (!consistent) return;
  const now = useAuth.getState();
  if (now.accessToken === stored.accessToken && now.refreshToken === stored.refreshToken && now.userId === stored.userId) return;
  useAuth.setState({ ...stored, isAuthenticated: !!stored.accessToken });
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'accessToken' || event.key === 'refreshToken' || event.key === 'userId') {
      syncAuthFromStorage();
    }
  });
}
