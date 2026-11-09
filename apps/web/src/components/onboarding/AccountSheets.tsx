/*
 * Sign-out and account-deletion sheets (auth.html №22, №23). They say what really happens: how to come back
 * (the method and address used to sign in), and what a deletion takes away with real counts.
 */
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { getLastLoginMethod, type LoginMethod } from '../../hooks/useAuth';
import { trpc } from '../../lib/trpc';
import { CrossGlyph, DashGlyph, Spinner } from './states';

const METHOD_NAME: Record<Exclude<LoginMethod, 'email'>, string> = { google: 'Google', apple: 'Apple', telegram: 'Telegram' };

/** One line about how to come back, by the method used last time and the account e-mail. */
function useReturnLine(email: string | null | undefined): ReactNode {
  const { t } = useTranslation();
  const method = getLastLoginMethod();
  // The address is a React text child, not an interpolated value
  const values = { method: method && method !== 'email' ? METHOD_NAME[method] : '' };
  const b = { b: <b className="font-bold text-ink">{email}</b> };
  if (method === 'email' && email) return <Trans i18nKey="profile.logoutByEmail" values={values} components={b} />;
  if (method && method !== 'email' && email) return <Trans i18nKey="profile.logoutByMethodEmail" values={values} components={b} />;
  if (method && method !== 'email') return <Trans i18nKey="profile.logoutByMethod" values={values} components={b} />;
  if (email) return <Trans i18nKey="profile.logoutEmailOnly" values={values} components={b} />;
  return t('profile.logoutGeneric');
}

export function LogoutSheet({
  open,
  onClose,
  onConfirm,
  email,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  email?: string | null;
}) {
  const { t } = useTranslation();
  const line = useReturnLine(email);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('profile.logoutTitle')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('profile.stay')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t('profile.logoutConfirm')}
          </Button>
        </>
      }
    >
      <p className="text-body-s text-ink-muted">{line}</p>
    </Sheet>
  );
}

function Gone({ keep = false, title, note }: { keep?: boolean; title: string; note?: string }) {
  return (
    <li className="flex items-start gap-3 py-2.5 text-body-s leading-snug text-ink [&+li]:shadow-[inset_0_1px_0_rgb(var(--so-line)/0.08)]">
      <i
        className={
          keep
            ? 'mt-[-1px] grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-canvas text-ink-muted [&_svg]:h-3.5 [&_svg]:w-3.5'
            : 'mt-[-1px] grid h-6 w-6 shrink-0 place-items-center rounded-sm bg-sos-soft text-sos [&_svg]:h-3.5 [&_svg]:w-3.5'
        }
        aria-hidden
      >
        {keep ? <DashGlyph /> : <CrossGlyph />}
      </i>
      <span>
        {title}
        {note ? <small className="mt-px block text-label font-semibold text-ink-muted">{note}</small> : null}
      </span>
    </li>
  );
}

export function DeleteAccountSheet({
  open,
  onClose,
  onConfirm,
  pending,
  failed,
  selfId,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
  failed: boolean;
  selfId: string;
}) {
  const { t } = useTranslation();
  // Real numbers for what goes away (only while the sheet is open)
  const connections = trpc.connection.getCount.useQuery(undefined, { enabled: open });
  const mine = trpc.collection.myActive.useQuery(undefined, { enabled: open });
  const joined = trpc.collection.myParticipating.useQuery(undefined, { enabled: open });
  const loading = connections.isLoading || mine.isLoading || joined.isLoading;
  // Without the real numbers the sheet cannot say what goes away: no deletion until they load
  const countsFailed = connections.isError || mine.isError || joined.isError;
  const retryCounts = () => {
    if (connections.isError) void connections.refetch();
    if (mine.isError) void mine.refetch();
    if (joined.isError) void joined.refetch();
  };

  const people = connections.data?.count ?? 0;
  const ownOpen = mine.data?.length ?? 0;
  const joinedOpen = (joined.data ?? []).filter(
    (row) => row.collection.creator.id !== selfId && (row.collection.status === 'ACTIVE' || row.collection.status === 'BLOCKED'),
  ).length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('account.deleteTitle')}
      description={t('account.deleteLead')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('account.keep')}
          </Button>
          <Button variant="danger" loading={pending} disabled={loading || countsFailed} onClick={onConfirm}>
            {t('account.deleteConfirm')}
          </Button>
        </>
      }
    >
      {countsFailed ? (
        <div className="py-4 text-center" role="alert">
          <p className="text-label font-semibold text-sos">{t('account.deleteCountsFailed')}</p>
          <Button variant="secondary" size="md" className="mt-3" onClick={retryCounts}>
            {t('common.retry')}
          </Button>
        </div>
      ) : loading ? (
        <div className="grid place-items-center py-6">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <ul className="mt-1">
          <Gone title={t('account.goneProfile')} note={t('account.goneProfileNote')} />
          {people > 0 ? (
            <Gone title={t('account.goneConnections', { count: people })} note={t('account.goneConnectionsNote')} />
          ) : (
            <Gone title={t('account.goneRequests')} />
          )}
          {ownOpen > 0 ? (
            <Gone
              title={t('account.goneOwn', { count: ownOpen })}
              note={joinedOpen > 0 ? t('account.goneJoinedToo', { count: joinedOpen }) : undefined}
            />
          ) : joinedOpen > 0 ? (
            <Gone title={t('account.goneJoined', { count: joinedOpen })} />
          ) : null}
          <Gone keep title={t('account.keepPast')} note={t('account.keepPastNote')} />
        </ul>
      )}
      {failed ? <p className="mt-2 text-label font-semibold text-sos">{t('account.deleteFailed')}</p> : null}
    </Sheet>
  );
}
