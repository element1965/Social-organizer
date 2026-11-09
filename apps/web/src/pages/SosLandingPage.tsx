import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isTelegramWebApp } from '@so/tg-adapter';
import { inflectName } from '../components/collection/name-case';
import { asDate, firstName, formatDay, relativePast } from '../components/collection/text';
import { Logo } from '../components/Logo';
import { Avatar } from '../components/ui2/Avatar';
import { Button } from '../components/ui2/Button';
import { formatMoney } from '../components/ui2/format';
import { IconAdd } from '../components/ui2/icons';
import { useAuth } from '../hooks/useAuth';
import { savePendingSos, sosCollectionPath } from '../lib/inviteUrl';
import { trpc } from '../lib/trpc';

const DEMO_COLLECTION = {
  id: 'preview',
  type: 'EMERGENCY' as const,
  status: 'ACTIVE' as const,
  amount: 2000,
  currentAmount: 650,
  currency: 'USD',
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  closedAt: null as string | null,
  suspended: false,
  creator: { id: 'demo', name: 'Андрей Луб', photoUrl: null as string | null },
  _count: { obligations: 7 },
};

const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim() || '';

/** Old API exposes blockReason; the new one exposes suspended and never the raw reason. */
function isSuspended(collection: { status: string; suspended?: boolean; blockReason?: string | null }): boolean {
  if (typeof collection.suspended === 'boolean') return collection.suspended;
  return collection.status === 'BLOCKED' && collection.blockReason != null;
}

export function SosLandingPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuth((state) => state.isAuthenticated);
  const isPreview = collectionId === 'preview';
  const language = i18n.language;
  const inflect = language.toLowerCase().startsWith('ru');

  const fetched = trpc.collection.getPublic.useQuery(
    { id: collectionId ?? '' },
    { enabled: !!collectionId && !isPreview },
  );

  const collection = isPreview ? DEMO_COLLECTION : fetched.data;
  const loading = !isPreview && fetched.isLoading;

  const join = () => {
    if (!collectionId || isPreview) return;
    const path = sosCollectionPath(collectionId);
    if (isAuthenticated || isTelegramWebApp()) {
      window.location.href = path;
      return;
    }
    savePendingSos(collectionId);
    window.location.href = `/login?redirect=${encodeURIComponent(path)}`;
  };

  const given = (name: string) => (inflect ? inflectName(name, 'dative') : firstName(name));
  const circle = (name: string) => (inflect ? inflectName(name, 'genitive') : firstName(name));

  return (
    <div
      className="flex min-h-dvh justify-center bg-canvas text-ink"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="flex w-full max-w-[460px] flex-col items-center px-5"
        style={{ paddingTop: 'max(1.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 text-body-s font-extrabold">
          <Logo size={28} className="text-ink" />
          <span>{t('common.appName')}</span>
        </div>

        {loading ? (
          <p className="mt-16 text-body-s font-semibold text-ink-muted">{t('common.loading')}</p>
        ) : !collection ? (
          <div className="mt-16 w-full text-center">
            <p className="text-body-s font-semibold text-ink-muted">{t('common.notFound')}</p>
            <Button className="mt-4 w-full" onClick={() => fetched.refetch()}>{t('common.retry')}</Button>
          </div>
        ) : (
          <PublicBody
            name={collection.creator.name}
            photoUrl={collection.creator.photoUrl}
            headline={t('sos.headline', { name: given(collection.creator.name) })}
            circleName={circle(collection.creator.name)}
            typeLabel={collection.type === 'REGULAR' ? t('collection.monthly') : t('collection.oneTime')}
            status={collection.status}
            amount={collection.amount}
            currentAmount={collection.currentAmount}
            people={collection._count.obligations}
            opened={asDate(collection.createdAt)}
            closed={asDate(collection.closedAt)}
            suspended={isSuspended(collection)}
            language={language}
            telegramUrl={!isPreview && collectionId && TELEGRAM_BOT && !isTelegramWebApp()
              ? `https://t.me/${TELEGRAM_BOT}?startapp=sos_${collectionId}`
              : null}
            onJoin={join}
          />
        )}
      </div>
    </div>
  );
}

type PublicBodyProps = {
  name: string;
  photoUrl: string | null;
  headline: string;
  circleName: string;
  typeLabel: string;
  status: string;
  amount: number | null;
  currentAmount: number;
  people: number;
  opened: Date | null;
  closed: Date | null;
  suspended: boolean;
  language: string;
  telegramUrl: string | null;
  onJoin: () => void;
};

function PublicBody({
  name,
  photoUrl,
  headline,
  circleName,
  typeLabel,
  status,
  amount,
  currentAmount,
  people,
  opened,
  closed,
  suspended,
  language,
  telegramUrl,
  onJoin,
}: PublicBodyProps) {
  const { t } = useTranslation();
  const closedStatus = status === 'CLOSED' || status === 'CANCELLED';
  const adminHold = status === 'BLOCKED' && suspended;
  const goalMet = status === 'BLOCKED' && !suspended;
  const joinable = status === 'ACTIVE';
  const hasGoal = amount != null && amount > 0;
  const percent = hasGoal ? Math.max(0, Math.min(100, (currentAmount / amount) * 100)) : 0;

  let when = typeLabel;
  if (closedStatus && closed) when = `${typeLabel} · ${t('collection.closedOn', { date: formatDay(closed, language) })}`;
  else if (opened) when = `${typeLabel} · ${t('collection.opened', { when: relativePast(opened, language) })}`;

  let footer = '';
  if (closedStatus) footer = t('sos.closedLine');
  else if (adminHold) footer = t('sos.suspendedLine');
  else if (goalMet) footer = t('sos.fullLine');

  return (
    <>
      <Avatar name={name} src={photoUrl} size={88} className="mt-14" />
      <h1 className="mt-3.5 text-center text-h2 font-extrabold">{headline}</h1>
      <p className="mt-2 text-center text-body-s font-semibold text-ink-muted">{when}</p>

      <section className="mt-6 w-full rounded-xl bg-surface p-4 text-left shadow-card">
        {hasGoal ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <b className="text-h2 font-extrabold tabular-nums">{formatMoney(currentAmount)}</b>
              <span className="text-body-s font-semibold text-ink-muted">{t('sos.ofGoal', { amount: formatMoney(amount) })}</span>
            </div>
            <div className="mt-2.5 h-2.5 overflow-hidden rounded-pill bg-canvas">
              <i className="block h-full rounded-pill bg-care" style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : (
          <p className="text-body-s font-semibold text-ink-muted">{t('collection.noGoal')}</p>
        )}
        <p className="mt-2 text-label font-semibold text-ink-muted">{t('sos.peopleLine', { count: people })}</p>
      </section>

      {joinable ? (
        <div className="mt-3 flex w-full items-start gap-3 rounded-lg bg-care-soft p-3.5 text-left text-caption font-semibold">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-care">
            <IconAdd className="h-5 w-5" />
          </span>
          <p>
            <b className="font-extrabold">{t('sos.joinCircle', { name: circleName })}</b>{' '}
            {t('sos.joinCircleBody')}
          </p>
        </div>
      ) : null}

      <div className="mt-auto w-full pb-2 pt-8">
        {joinable ? (
          <>
            <Button className="w-full" onClick={onJoin}>{t('sos.join')}</Button>
            {telegramUrl ? (
              <a href={telegramUrl} className="mt-3 block text-center text-body-s font-extrabold text-care">
                {t('sos.openTelegram')}
              </a>
            ) : null}
            <p className="mt-3 text-center text-label font-semibold text-ink-muted">{t('sos.joinNext')}</p>
          </>
        ) : (
          <p className="text-center text-body-s font-semibold text-ink-muted">{footer}</p>
        )}
      </div>
    </>
  );
}
