import { useTranslation } from 'react-i18next';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { QR_LOGO_LEVEL, qrLogo } from '../../lib/qrLogo';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { shortUrl } from './text';

const PRINT_ID = 'collection-qr-print';

type QrSheetProps = {
  open: boolean;
  url: string;
  onClose: () => void;
};

export function QrSheet({ open, url, onClose }: QrSheetProps) {
  const { t } = useTranslation();

  const download = () => {
    const canvas = document.getElementById(PRINT_ID);
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'collection-qr.png';
    link.click();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('collection.qrSheetTitle')} description={t('collection.qrLead')}>
      {/* White plate is the quiet zone. A theme surface can be dark, and a dark quiet zone will not scan. */}
      <div className="mx-auto grid h-[156px] w-[156px] place-items-center rounded-lg" style={{ backgroundColor: 'rgb(255, 255, 255)' }}>
        <QRCodeSVG value={url} size={128} level={QR_LOGO_LEVEL} imageSettings={qrLogo(128)} includeMargin={false} fgColor="rgb(0, 0, 0)" bgColor="rgb(255, 255, 255)" title={t('collection.qrSheetTitle')} />
      </div>
      <p className="mt-2.5 truncate text-center text-label font-semibold text-ink-muted">{shortUrl(url)}</p>
      <QRCodeCanvas id={PRINT_ID} value={url} size={1024} level={QR_LOGO_LEVEL} imageSettings={qrLogo(1024)} includeMargin fgColor="rgb(0, 0, 0)" bgColor="rgb(255, 255, 255)" className="hidden" />
      <Button variant="secondary" className="mt-4 w-full" onClick={download}>
        {t('collection.qrPrint')}
      </Button>
      <Button variant="ghost" className="mt-2.5 w-full" onClick={onClose}>
        {t('common.done')}
      </Button>
    </Sheet>
  );
}
