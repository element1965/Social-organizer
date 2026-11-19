/**
 * Device display preferences (theme, larger text, language) apply on this device at once and stay applied
 * when saving them to the account fails: they must work during an outage. The account copy is best-effort and
 * quiet (straight through the client: no mutation, no notice).
 *
 * Each choice is recorded as the latest intent (with a revision) in localStorage before anything is sent, per
 * account and setting. Writes are serialised per account and setting: one in flight; when it settles, the
 * latest intent is sent if it is newer. An intent is cleared only when the server acknowledged that same
 * revision, so an older write that fails late can never put back an older value. What is left (the app was
 * closed, the save failed) is sent on the next signed-in start (AppShell) or the next change. Every send is
 * bound to its account (`context.account`, lib/trpc.ts sessionLink): if another account is signed in by then,
 * it is cancelled and waits for its own account.
 */

export type DisplaySettings = {
  theme: 'SYSTEM' | 'LIGHT' | 'DARK';
  fontScale: number;
  language: string;
};
type Key = keyof DisplaySettings;
type Intent<K extends Key> = { value: DisplaySettings[K]; rev: number };
type Stored = { [K in Key]?: Intent<K> };

const PREFIX = 'so.pendingSettings.';

function read(userId: string): Stored {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function write(userId: string, value: Stored) {
  try {
    if (Object.keys(value).length === 0) localStorage.removeItem(PREFIX + userId);
    else localStorage.setItem(PREFIX + userId, JSON.stringify(value));
  } catch {
    /* storage unavailable: the value is still applied on this device */
  }
}

/** True while a value of this setting has not been acknowledged by the server (waiting or in flight). */
export function hasPendingSetting(userId: string | null, key: Key): boolean {
  return !!userId && read(userId)[key] !== undefined;
}

/** The value waiting to be saved, if any. */
export function pendingSettingValue<K extends Key>(userId: string | null, key: K): DisplaySettings[K] | undefined {
  if (!userId) return undefined;
  return (read(userId)[key] as Intent<K> | undefined)?.value;
}

type Mutate<I> = { mutate: (input: I, opts?: { context?: Record<string, unknown> }) => Promise<unknown> };
export type SettingsClient = {
  settings: {
    updateTheme: Mutate<{ theme: DisplaySettings['theme'] }>;
    updateFontScale: Mutate<{ fontScale: number }>;
    updateLanguage: Mutate<{ language: string }>;
  };
};

function send<K extends Key>(client: SettingsClient, userId: string, key: K, value: DisplaySettings[K]): Promise<unknown> {
  const opts = { context: { account: userId } };
  if (key === 'theme') return client.settings.updateTheme.mutate({ theme: value as DisplaySettings['theme'] }, opts);
  if (key === 'fontScale') return client.settings.updateFontScale.mutate({ fontScale: value as number }, opts);
  return client.settings.updateLanguage.mutate({ language: value as string }, opts);
}

const inFlight = new Set<string>();
const afterSave = new Map<string, () => void>();

/** Send the latest intent of one setting, unless a write of it is already in flight (that one sends it next). */
function pump<K extends Key>(client: SettingsClient, userId: string, key: K) {
  const slot = `${userId}:${key}`;
  if (inFlight.has(slot)) return;
  const intent = read(userId)[key] as Intent<K> | undefined;
  if (!intent) return;
  inFlight.add(slot);
  void send(client, userId, key, intent.value).then(
    () => {
      inFlight.delete(slot);
      const now = read(userId);
      if ((now[key] as Intent<K> | undefined)?.rev === intent.rev) {
        delete now[key];
        write(userId, now);
        afterSave.get(slot)?.();
        return;
      }
      pump(client, userId, key); // a newer choice came in meanwhile
    },
    () => {
      inFlight.delete(slot);
      // A failed write leaves its intent for later; a newer one recorded meanwhile goes out now
      if (((read(userId)[key] as Intent<K> | undefined)?.rev ?? intent.rev) !== intent.rev) pump(client, userId, key);
    },
  );
}

/** Record a choice as the latest intent and save it to the account (quietly). `onSaved` runs once it is acknowledged. */
export function saveDisplaySetting<K extends Key>(
  client: SettingsClient,
  userId: string | null,
  key: K,
  value: DisplaySettings[K],
  onSaved?: () => void,
) {
  if (!userId) return;
  const stored = read(userId);
  const rev = ((stored[key] as Intent<K> | undefined)?.rev ?? 0) + 1;
  (stored as Record<Key, Intent<Key>>)[key] = { value, rev };
  write(userId, stored);
  if (onSaved) afterSave.set(`${userId}:${key}`, onSaved);
  pump(client, userId, key);
}

/** Send what is waiting for this account (the app started signed in). */
export function flushPendingSettings(client: SettingsClient, userId: string | null) {
  if (!userId) return;
  for (const key of Object.keys(read(userId)) as Key[]) pump(client, userId, key);
}
