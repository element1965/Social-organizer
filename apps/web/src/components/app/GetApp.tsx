import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { SITE_ORIGIN, STORE_URL, useDevice, type Device } from '../../lib/device';
import { QR_LOGO_LEVEL, qrLogo } from '../../lib/qrLogo';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { IconApple, IconPlay } from '../site/icons';
import { openExternal } from '../profile/openExternal';
import { dismissGetAppPrompt, showsGetAppPrompt } from './getAppPrompt';

type Store = 'play' | 'appstore';

/** The phone's own store only; a computer (or Telegram Desktop) gets both and a QR for the phone. */
function storesFor(device: Device): Store[] {
  if (device === 'android') return ['play'];
  if (device === 'ios') return ['appstore'];
  return ['play', 'appstore'];
}

function StoreButton({ store, primary }: { store: Store; primary: boolean }) {
  const { t } = useTranslation();
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      size="md"
      className="w-full"
      icon={store === 'play' ? <IconPlay className="h-5 w-5" /> : <IconApple className="h-5 w-5" />}
      onClick={() => openExternal(STORE_URL[store])}
    >
      {t(store === 'play' ? 'getApp.play' : 'getApp.appstore')}
    </Button>
  );
}

/** Circle feed card in a phone browser: why the app is better, one store button, a way to close it. */
export function GetAppCard() {
  const { t } = useTranslation();
  const device = useDevice();
  const [visible, setVisible] = useState(() => showsGetAppPrompt(device));
  if (!visible) return null;
  const store = storesFor(device)[0] as Store;

  const close = () => {
    dismissGetAppPrompt();
    setVisible(false);
  };

  return (
    <section className="relative my-3 rounded-lg bg-surface p-4 shadow-card" aria-labelledby="get-app-title">
      <button
        type="button"
        onClick={close}
        aria-label={t('getApp.dismiss')}
        className="so-focus absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-md text-ink-subtle hover:text-ink"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <h2 id="get-app-title" className="pr-8 text-body font-bold text-ink">{t('getApp.title')}</h2>
      <p className="mt-1 text-body-s text-ink-muted">{t('getApp.text')}</p>
      <div className="mt-3">
        <StoreButton store={store} primary />
      </div>
    </section>
  );
}

/** Profile → "The app": the store links for this device, and a QR for the phone on a computer. */
export function GetAppSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const device = useDevice();
  const stores = storesFor(device);
  const qr = device === 'desktop';

  return (
    <Sheet open={open} onClose={onClose} title={t('getApp.sheetTitle')} description={t('getApp.text')}>
      <div className="space-y-2">
        {stores.map((store, i) => (
          <StoreButton key={store} store={store} primary={i === 0} />
        ))}
      </div>
      {qr ? (
        <div className="mt-4 flex items-center gap-4 rounded-lg bg-canvas p-3">
          {/* qrcode.react paints its own white quiet zone, so the code scans in the dark theme too */}
          <span className="shrink-0 overflow-hidden rounded-md">
            <QRCodeCanvas
              value={`${SITE_ORIGIN}/get`}
              size={112}
              marginSize={2}
              level={QR_LOGO_LEVEL}
              imageSettings={qrLogo(112)}
              role="img"
              aria-label={t('landing.start.qrAria')}
            />
          </span>
          <span>
            <b className="block text-body-s font-bold text-ink">{t('landing.start.qrTitle')}</b>
            <span className="mt-0.5 block text-label font-semibold text-ink-muted">{t('landing.start.qrText')}</span>
          </span>
        </div>
      ) : null}
    </Sheet>
  );
}
