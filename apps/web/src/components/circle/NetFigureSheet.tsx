import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';

/** What "Declared participation of the network" means: the same sheet from the Circle header and the Profile row. */
export function NetFigureSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('circle.stats.canHelp')}
      description={t('circle.stats.explain')}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    />
  );
}
