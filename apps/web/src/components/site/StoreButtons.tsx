import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeCanvas } from 'qrcode.react';
import { QR_LOGO_LEVEL, qrLogo } from '../../lib/qrLogo';
import { SITE_ORIGIN, storeButtons, type Device, type StoreId } from '../../lib/device';
import { cn } from '../../lib/utils';
import { usePendingInvite, useStoreLinks } from './DeviceEntry';
import { IconApple, IconPlay, IconTelegram } from './icons';
import { useLoginHref } from './SiteHeader';

/**
 * Store block (site.html №1, «Начните с людей…»): the device's own store first and dark, the rest light.
 * On desktop the browser goes first and a QR card points phones to `/get`, which opens the right store.
 */
export function StoreButtons({ device, invite }: { device: Device; invite?: string | null }) {
  const { t } = useTranslation();
  const pending = usePendingInvite(invite);
  const links = useStoreLinks(pending);
  const loginHref = useLoginHref();
  const { buttons, qr } = storeButtons(device);

  const content = (id: StoreId) => {
    switch (id) {
      case 'play':
        return (
          <>
            <IconPlay />
            {t('landing.start.play')}
          </>
        );
      case 'appstore':
        return (
          <>
            <IconApple />
            {t('landing.start.appstore')}
          </>
        );
      case 'telegram':
        return (
          <>
            <IconTelegram />
            {t('landing.start.telegram')}
          </>
        );
      default:
        return t('landing.start.web');
    }
  };

  const qrValue = `${SITE_ORIGIN}/get${pending ? `?invite=${encodeURIComponent(pending)}` : ''}`;

  return (
    <>
      <div className="site-stores">
        {buttons.map((b) => {
          const cls = cn('site-store', !b.primary && 'light');
          if (b.id === 'web') {
            return (
              <Link key={b.id} to={loginHref} className={cls}>
                {content(b.id)}
              </Link>
            );
          }
          const href = b.id === 'play' ? links.play : b.id === 'appstore' ? links.appstore : links.telegram;
          return (
            <a key={b.id} href={href} target="_blank" rel="noopener noreferrer" className={cls}>
              {content(b.id)}
            </a>
          );
        })}
      </div>
      {qr ? (
        <div className="site-qr">
          <QRCodeCanvas value={qrValue} size={128} marginSize={2} level={QR_LOGO_LEVEL} imageSettings={qrLogo(128)} role="img" aria-label={t('landing.start.qrAria')} />
          <span>
            <b>{t('landing.start.qrTitle')}</b>
            <span>{t('landing.start.qrText')}</span>
          </span>
        </div>
      ) : null}
    </>
  );
}
