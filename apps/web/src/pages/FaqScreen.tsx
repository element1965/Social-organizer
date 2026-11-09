import { useTranslation } from 'react-i18next';
import { FaqPage } from './FaqPage';
import { Screen } from '../components/ui2/Screen';
import { useSmartBack } from '../components/profile/useSmartBack';

export function FaqScreen() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me/help');
  return (
    <Screen title={t('faq.title')} back={back} width="column">
      <FaqPage embedded />
    </Screen>
  );
}
