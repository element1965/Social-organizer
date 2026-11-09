import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';

/** Plaque shown after the circle pauses a collection. The author also gets support. */
export function CommunityHoldNote({ owner, onSupport }: { owner: boolean; onSupport?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 rounded-xl bg-sos-soft px-4 py-3 text-body-s font-semibold text-sos">
      <p className="font-extrabold">{t('moderation.heldTitle')}</p>
      {owner ? <p className="mt-1">{t('moderation.heldOwner')}</p> : null}
      {owner && onSupport ? (
        <Button variant="text" className="mt-1 px-0 text-sos" onClick={onSupport}>
          {t('collection.writeSupport')}
        </Button>
      ) : null}
    </div>
  );
}
