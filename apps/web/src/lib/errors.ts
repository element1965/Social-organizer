import { isNetworkFailure, isOffline } from './connectivity';

/**
 * What went wrong with a request, in the terms the person needs: what happened and what to do next.
 * Decided by the tRPC error code (and the HTTP status for answers that are not tRPC-shaped), never by
 * the server's message text: those messages are English developer strings or codes, not interface copy.
 */
export type ErrorKind =
  /** No answer at all: the device is offline or the server cannot be reached (or the session could not be renewed for that reason). */
  | 'offline'
  /** The session was refused: UNAUTHORIZED after the renewal in lib/trpc.ts was refused too. */
  | 'session'
  /** FORBIDDEN: the account may not do this (or was deleted). */
  | 'forbidden'
  /** NOT_FOUND: the thing is gone. A load shows "not here"; an action treats it like `changed`. */
  | 'notFound'
  /** TOO_MANY_REQUESTS or an HTTP 429 from the server's rate limit. */
  | 'rateLimit'
  /** The input did not pass the server's schema (BAD_REQUEST with `invalidFields`, see apps/api/src/trpc.ts). */
  | 'invalid'
  /**
   * The server refused the action as things stand now: CONFLICT, PRECONDITION_FAILED, and the server's own
   * BAD_REQUEST refusals that are not schema errors ("Collection is not active").
   */
  | 'changed'
  /** The request was cancelled (navigation, unmount): never told to anyone. */
  | 'aborted'
  /** Everything else: a 5xx, a broken answer, an unknown failure. */
  | 'server';

type ErrorLike = {
  name?: unknown;
  data?: { code?: unknown; httpStatus?: unknown; invalidFields?: unknown } | null;
  meta?: { response?: { status?: unknown } } | null;
  cause?: unknown;
};

const CHANGED = new Set(['CONFLICT', 'PRECONDITION_FAILED']);
const INVALID = new Set(['UNPROCESSABLE_CONTENT', 'PAYLOAD_TOO_LARGE']);

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === 'object' && error !== null ? (error as ErrorLike) : null;
}

/** The tRPC error code of a failed call, if the server sent one. */
export function errorCode(error: unknown): string | undefined {
  const code = asErrorLike(error)?.data?.code;
  return typeof code === 'string' ? code : undefined;
}

/** The input fields the server's schema refused (top-level names, e.g. `chatLink`), or null. */
export function invalidFields(error: unknown): string[] | null {
  const fields = asErrorLike(error)?.data?.invalidFields;
  return Array.isArray(fields) ? fields.filter((field): field is string => typeof field === 'string') : null;
}

function httpStatus(error: ErrorLike): number | undefined {
  const status = error.data?.httpStatus ?? error.meta?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

/** A cancelled request: fetch's AbortError, directly or as the cause tRPC keeps. */
export function isAborted(error: unknown): boolean {
  const like = asErrorLike(error);
  if (!like) return false;
  if (like.name === 'AbortError') return true;
  const cause = asErrorLike(like.cause);
  return cause?.name === 'AbortError';
}

export function errorKind(error: unknown): ErrorKind {
  if (isAborted(error)) return 'aborted';
  const like = asErrorLike(error);
  const code = errorCode(error);
  const status = like ? httpStatus(like) : undefined;
  if (code === 'UNAUTHORIZED' || (!code && status === 401)) return 'session';
  if (code === 'FORBIDDEN' || (!code && status === 403)) return 'forbidden';
  if (code === 'TOO_MANY_REQUESTS' || status === 429) return 'rateLimit';
  if (code === 'NOT_FOUND') return 'notFound';
  if (code && INVALID.has(code)) return 'invalid';
  if (code === 'BAD_REQUEST') return invalidFields(error) ? 'invalid' : 'changed';
  if (code && CHANGED.has(code)) return 'changed';
  if (!code && status === undefined) {
    // fetch() throws a TypeError without a network; tRPC keeps it as the cause
    if (isNetworkFailure(error) || isNetworkFailure(like?.cause) || isOffline()) return 'offline';
  }
  return 'server';
}

/** The sentence after "Not saved" for a failed action (keys under `errors.`). */
export function actionErrorKey(kind: ErrorKind): string {
  switch (kind) {
    case 'offline':
      return 'errors.offline';
    case 'session':
      return 'errors.session';
    case 'forbidden':
      return 'errors.forbidden';
    case 'rateLimit':
      return 'errors.rateLimit';
    case 'invalid':
      return 'errors.invalid';
    case 'notFound':
    case 'changed':
      return 'errors.changed';
    default:
      return 'errors.server';
  }
}

// --- Mutation meta ------------------------------------------------------------
// Every failed mutation reaches the app-level notice (components/errors/ActionErrorHost.tsx) unless the call
// site tells the person itself. Such a call site says so with `meta: { notifyOnError: false }`, or with a
// function that returns false for the errors it covers (e.g. a "request declined" state of its own).
// The notice belongs to the navigation the action started on (App.tsx records it when the mutation starts): a
// failure that arrives after the person navigated is dropped. A save started on the way out (in an unmount)
// starts on the new screen already, so its failure is told there.

export type MutationMeta = {
  notifyOnError?: boolean | ((error: unknown) => boolean);
};

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationMeta;
  }
}

export function wantsNotice(meta: MutationMeta | undefined, error: unknown): boolean {
  if (isAborted(error)) return false;
  const flag = meta?.notifyOnError;
  if (typeof flag === 'function') return flag(error);
  return flag !== false;
}

// --- App-level notice ---------------------------------------------------------
// A tiny store outside React, so the MutationCache (created before any component) can raise the notice.
// Each notice remembers the path it was raised on; the host clears it when the person navigates away.

// Notices belong to a navigation, not to a path: every navigation (a new history entry, a query-string change,
// leaving and coming back to the same address) starts a new one (ActionErrorHost counts them).
export type ActionNotice = { id: number; kind: ErrorKind; navigation: number };

let current: ActionNotice | null = null;
let counter = 0;
let navigation = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** The navigation the person is on now: an action records it when it starts. */
export function currentNavigation(): number {
  return navigation;
}

/** A navigation happened: a new screen instance; the notice of the previous one goes away. */
export function markNavigation() {
  navigation += 1;
  if (current && current.navigation !== navigation) {
    current = null;
    emit();
  }
}

/**
 * Show the app-level notice for a failed action. `origin`: the navigation the action was started on; when the
 * person has navigated since, the failure is not told on the new screen. Without it (a save made on the way
 * out, such as the Account autosave), it is told where they are now.
 */
export function raiseActionError(error: unknown, origin?: number) {
  const kind = errorKind(error);
  if (kind === 'aborted') return;
  if (origin !== undefined && origin !== navigation) return;
  counter += 1;
  current = { id: counter, kind, navigation };
  emit();
}

export function dismissActionError(id: number) {
  if (current?.id !== id) return;
  current = null;
  emit();
}

export function subscribeActionError(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentActionError(): ActionNotice | null {
  return current;
}
