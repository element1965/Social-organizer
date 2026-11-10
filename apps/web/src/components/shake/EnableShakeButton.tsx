import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { useShakePermission } from '../../hooks/useShakeDetector';

/** Shown only in a mobile browser that still needs a tap to allow motion sensors. */
export function EnableShakeButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { needsPermission, requestPermission } = useShakePermission();
  if (!needsPermission) return null;
  return (
    <Button className={className} variant="secondary" size="md" onClick={() => void requestPermission()}>
      {t('shake.enable')}
    </Button>
  );
}
