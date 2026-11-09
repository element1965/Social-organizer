import { useTranslation } from 'react-i18next';
import { Row } from '../ui2/Group';
import { Sheet } from '../ui2/Sheet';
import { APP_VERSION, GITHUB_URL } from './constants';
import { openExternal } from './openExternal';

export function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.about')}>
      <div className="overflow-hidden rounded-lg bg-canvas">
        <Row title={t('profile.terms')} to="/terms" variant="link" />
        <Row title={t('profile.privacy')} to="/privacy" variant="link" />
        <Row title={t('profile.aboutVersion', { version: APP_VERSION })} />
        <Row title={t('profile.openSource')} variant="link" onClick={() => openExternal(GITHUB_URL)} />
      </div>
    </Sheet>
  );
}
