import { useTranslation } from 'react-i18next';
import { Group, Row } from '../components/ui2/Group';
import { Screen } from '../components/ui2/Screen';
import { COMMUNITY_URL } from '../components/profile/constants';
import { openExternal } from '../components/profile/openExternal';
import { useSmartBack } from '../components/profile/useSmartBack';

export function HelpPage() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me');
  return (
    <Screen title={t('nav.help')} back={back} width="column">
      <Group>
        <Row title={t('help.faq')} to="/me/help/faq" variant="link" />
        <Row title={t('help.assistant')} subtitle={t('help.assistantHint')} to="/me/help/assistant" variant="link" />
        <Row title={t('help.how')} to="/how" variant="link" />
        <Row title={t('help.replayIntro')} to="/intro" variant="link" />
        <Row title={t('help.community')} variant="link" onClick={() => openExternal(COMMUNITY_URL)} />
      </Group>
    </Screen>
  );
}
