import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BroadcastPanel } from '../components/BroadcastPanel';
import { Screen } from '../components/ui2/Screen';
import { QueryState } from '../components/profile/QueryState';
import { trpc } from '../lib/trpc';

export function BroadcastScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const admin = trpc.faq.isAdmin.useQuery();

  if (admin.isLoading) {
    return (
      <Screen title={t('profile.broadcast')} width="column">
        <QueryState isLoading />
      </Screen>
    );
  }
  if (!admin.data?.isAdmin) return <Navigate to="/me" replace />;
  return <BroadcastPanel onClose={() => navigate('/me')} />;
}
