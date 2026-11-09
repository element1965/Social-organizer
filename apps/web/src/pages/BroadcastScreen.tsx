import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BroadcastPanel } from '../components/BroadcastPanel';
import { Screen } from '../components/ui2/Screen';
import { QueryState } from '../components/profile/QueryState';
import { useSmartBack } from '../components/profile/useSmartBack';
import { trpc } from '../lib/trpc';

export function BroadcastScreen() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me');
  const admin = trpc.faq.isAdmin.useQuery();

  if (admin.isLoading) {
    return (
      <Screen title={t('profile.broadcast')} back={back} width="column">
        <QueryState isLoading />
      </Screen>
    );
  }
  if (!admin.data?.isAdmin) return <Navigate to="/me" replace />;
  return (
    <Screen title={t('broadcast.title')} back={back} width="column">
      <BroadcastPanel />
    </Screen>
  );
}
