import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LiveQr } from '../components/add/LiveQr';
import { Screen } from '../components/ui2/Screen';

export function QrPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Screen title={t('add.myQr')} back={{ label: t('nav.add'), to: '/add' }} width="column">
      <LiveQr onScan={() => navigate('/add/scan')} onDone={() => navigate('/add')} />
    </Screen>
  );
}
