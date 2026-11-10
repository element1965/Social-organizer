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
 * Forget everything this device saved about the signed-in person's network (the offline copy and the stats
 * cache). Fire-and-forget: if the page unloads first, the start-up sweep (main.tsx) finishes the job.
 */
export function wipeSavedCopy() {
  try { localStorage.removeItem('so_networkStats'); } catch { /* storage unavailable */ }
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
