import { useTranslation } from 'react-i18next';
import { ChatAssistant } from '../components/ChatAssistant';
import { Screen } from '../components/ui2/Screen';
import { useSmartBack } from '../components/profile/useSmartBack';

export function AssistantPage() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me/help');
  return (
    <Screen title={t('help.assistant')} back={back} width="column">
      <ChatAssistant page />
    </Screen>
  );
}