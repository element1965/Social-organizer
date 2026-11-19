import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { errorKind, type ErrorKind } from '../../lib/errors';
import { useAuth } from '../../hooks/useAuth';
import { safePath } from '../onboarding/flow';
import { Button } from '../ui2/Button';
import { IconLock } from '../ui2/icons';
import { AlertGlyph, InfoGlyph, OfflineGlyph, StateTile, type Tone } from '../onboarding/states';

/**
 * A whole-screen state in the auth-state style (mockups/v2/auth.html): a glyph in a soft tile, a title, one or
 * two sentences and one way onward. The page puts it in its own frame (a shell Screen or a public page).
 */
export function ErrorState({
  glyph,
  tone = 'neutral',
  title,
  body,
  action,
}: {
  glyph: ReactNode;
  tone?: Tone;
  title: string;
  body: string;
  action: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center pt-10 text-center">
      <StateTile tone={tone}>{glyph}</StateTile>
      <h1 className="mt-6 text-h2 font-bold [text-wrap:balance]">{title}</h1>
      <p className="mt-2.5 max-w-[32ch] text-body-s text-ink-muted">{body}</p>
      <div className="mt-8 w-full">{action}</div>
    </div>
  );
}

/**
 * A load failure that settles the question (not there, not for this account, session ended): what was shown
 * before must go. Anything else (no connection, a server failure) is transient, and a copy already on screen
 * stays.
 */
export function isDefinitiveLoadError(error: unknown): boolean {
  if (!error) return false;
  const kind = errorKind(error);
  return kind === 'notFound' || kind === 'forbidden' || kind === 'session' || kind === 'changed' || kind === 'invalid';
}

/**
 * Why a Need could not be shown, from the tRPC error code: it is not there, it is not for this account, the
 * session ended, there is no connection, or the server failed. Each gets the action that can help.
 */
export function NeedLoadError({
  error,
  signedIn,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  signedIn: boolean;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuth((s) => s.logout);
  const kind: ErrorKind = errorKind(error);
  const home = signedIn ? t('invite.toCircle') : t('login.deletedHome');
  const goHome = (
    <Button className="w-full" onClick={() => navigate('/')}>
      {home}
    </Button>
  );
  const retry = (
    <Button className="w-full" loading={retrying} onClick={onRetry}>
      {t('common.retry')}
    </Button>
  );

  // A bad id answers BAD_REQUEST: for the person it is the same as a Need that is not there
  if (kind === 'notFound' || kind === 'changed' || kind === 'invalid') {
    return <ErrorState glyph={<InfoGlyph />} title={t('errors.needGoneTitle')} body={t('errors.needGoneBody')} action={goHome} />;
  }
  if (kind === 'forbidden') {
    return <ErrorState glyph={<IconLock />} title={t('errors.loadFailed')} body={t('errors.forbidden')} action={goHome} />;
  }
  if (kind === 'session') {
    // The stored session is dead: end it first, as ProtectedRoute does. A signed-in person is sent away from
    // /login (TelegramBootstrap), so the sign-in screen only stays once the session is gone; a full load
    // keeps the shell gate from sending the address to the landing on the way.
    const signInAgain = () => {
      const back = safePath(location.pathname + location.search);
      logout();
      window.location.replace(back && back !== '/' ? `/login?reason=expired&redirect=${encodeURIComponent(back)}` : '/login?reason=expired');
    };
    return (
      <ErrorState
        glyph={<IconLock />}
        title={t('login.expiredTitle')}
        body={t('login.expiredText')}
        action={
          <Button className="w-full" onClick={signInAgain}>
            {t('invite.signIn')}
          </Button>
        }
      />
    );
  }
  if (kind === 'offline') {
    return <ErrorState glyph={<OfflineGlyph />} title={t('errors.loadFailed')} body={t('errors.offline')} action={retry} />;
  }
  const body = kind === 'rateLimit' ? t('errors.rateLimit') : t('errors.server');
  return <ErrorState glyph={<AlertGlyph />} title={t('errors.loadFailed')} body={body} action={retry} />;
}
