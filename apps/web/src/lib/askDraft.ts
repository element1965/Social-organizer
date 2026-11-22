export type AskType = 'EMERGENCY' | 'REGULAR';
export type AskDraft = { type: AskType; amount: string; chat: string };

const KEY = 'so.askDraft';
const EMPTY: AskDraft = { type: 'EMERGENCY', amount: '', chat: '' };

export function readAskDraft(userId: string | null): AskDraft {
  if (!userId) return EMPTY;
  try {
    const { owner, draft } = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    if (owner === userId && (draft?.type === 'EMERGENCY' || draft?.type === 'REGULAR')
      && typeof draft.amount === 'string' && typeof draft.chat === 'string') return draft;
  } catch {
    // Storage can be blocked by the browser.
  }
  return EMPTY;
}

export function writeAskDraft(userId: string | null, draft: AskDraft) {
  if (!userId) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ owner: userId, draft }));
  } catch {
    // The current form still works without storage.
  }
}

export function clearAskDraft(userId: string | null) {
  if (!userId) return;
  try {
    const { owner } = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    if (owner === userId) sessionStorage.removeItem(KEY);
  } catch {
    // Storage can be blocked by the browser.
  }
}
