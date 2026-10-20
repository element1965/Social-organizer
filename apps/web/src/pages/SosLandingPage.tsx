import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Avatar } from '../components/ui/avatar';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Logo } from '../components/Logo';
import { useAuth } from '../hooks/useAuth';
import { savePendingSos, sosCollectionPath } from '../lib/inviteUrl';

const TG_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';

const DEMO_COLLECTION = {
  id: 'preview',
  type: 'EMERGENCY' as const,
  status: 'ACTIVE' as const,
  amount: 2000,
  currentAmount: 650,
  currency: 'USD',
  creator: { id: 'demo', name: 'Андрей Луб', photoUrl: null },
  _count: { obligations: 7 },
};

export function SosLandingPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { t } = useTranslation();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const isPreview = collectionId === 'preview';

  const { data: fetched, isLoading } = trpc.collection.getPublic.useQuery(
    { id: collectionId! },
    { enabled: !!collectionId && !isPreview },
  );

  const collection = isPreview ? DEMO_COLLECTION : fetched;
  const loading = !isPreview && isLoading;

  const tgUrl = TG_BOT_USERNAME
    ? `https://t.me/${TG_BOT_USERNAME}?startapp=sos_${collectionId}`
    : '#';

  // Without Telegram: sign in / register in the browser, then land on the collection
  // (CollectionPage auto-connects to the creator via ?sos=true)
  const joinInBrowser = () => {
    if (!collectionId || isPreview) return;
    const path = sosCollectionPath(collectionId);
    if (isAuthenticated) {
      window.location.href = path;
      return;
    }
    savePendingSos(collectionId);
    window.location.href = `/login?redirect=${encodeURIComponent(path)}`;
  };

  const hasGoal = collection?.amount != null && collection.amount > 0;
  const percentage = hasGoal ? Math.min(100, (collection!.currentAmount / collection!.amount!) * 100) : 0;
  const isEmergency = collection?.type === 'EMERGENCY';
  const isActive = collection?.status === 'ACTIVE' || collection?.status === 'BLOCKED';
  const statusLabel = collection ? t(`collection.${collection.status.toLowerCase()}`) : '';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 bg-white dark:bg-gray-950"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-sm flex flex-col gap-5">
        {/* Logo + app name + slogan */}
        <div className="flex flex-col items-center gap-1">
          <Logo size={36} className="text-gray-900 dark:text-teal-400" />
          <p className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Social Organizer</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{t('landing.heroSmallLine')}</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : !collection ? (
          <p className="text-center text-gray-400">{t('common.notFound')}</p>
        ) : (
          <>
            {/* Emergency badge */}
            {isEmergency && (
              <div className="flex justify-center">
                <span className="text-2xl">🆘</span>
              </div>
            )}

            {/* Creator */}
            <div className="flex flex-col items-center gap-2 text-center">
              <Avatar src={collection.creator.photoUrl} name={collection.creator.name} size="lg" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{collection.creator.name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEmergency ? t('sos.needsEmergencyHelp') : t('sos.needsSupport')}
              </p>
            </div>

            {/* Amount + progress */}
            {hasGoal && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                  <span>${Math.round(collection.currentAmount)} {t('collection.collected').toLowerCase()}</span>
                  <span>{t('collection.goal')}: ${collection.amount}</span>
                </div>
                <Progress value={collection.currentAmount} max={collection.amount!} />
                <p className="text-xs text-gray-400 text-right">
                  {percentage.toFixed(0)}% · {t('sos.participantsCount', { count: collection._count.obligations })}
                </p>
              </div>
            )}

            {/* CTA */}
            {isActive ? (
              <div className="flex flex-col gap-3">
                <a
                  href={tgUrl}
                  className="block w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-center font-semibold text-base transition-colors"
                >
                  🤝 {t('sos.joinBtn')}
                </a>
                <button
                  type="button"
                  onClick={joinInBrowser}
                  className="block w-full py-3 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 text-center font-medium text-sm transition-colors"
                >
                  {t('sos.joinInBrowser')}
                </button>
              </div>
            ) : (
              <div className="text-center text-sm text-gray-400 py-2">
                {t('sos.collectionClosed', { status: statusLabel })}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
