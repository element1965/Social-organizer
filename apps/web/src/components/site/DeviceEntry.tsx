import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { heroCta, storeLinks, type Device, type HeroAction, type StoreLinks } from '../../lib/device';
import { IconApple, IconPlay, IconTelegram } from './icons';
import { useLoginHref } from './SiteHeader';

/** The invite a guest came with (`?invite=` or one saved earlier), so store links can carry it. */
export function usePendingInvite(explicit?: string | null): string | null {
  if (explicit) return explicit;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('invite');
    return fromUrl || localStorage.getItem('pendingInviteToken');
  } catch {
    return null;
  }
}

export function useStoreLinks(invite?: string | null): StoreLinks {
  return storeLinks(usePendingInvite(invite));
}

function ActionLink({ action, label, links, loginHref }: { action: HeroAction; label: string; links: StoreLinks; loginHref: string }) {
  const cls = `site-btn ${action.kind}`;
  const icon: ReactNode = action.icon === 'play' ? <IconPlay /> : action.icon === 'apple' ? <IconApple /> : null;
  if (action.id === 'play' || action.id === 'appstore' || action.id === 'telegram') {
    const href = action.id === 'play' ? links.play : action.id === 'appstore' ? links.appstore : links.telegram;
    return (
      <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
        {icon}
        {label}
      </a>
    );
  }
  return (
    <Link className={cls} to={action.id === 'how' ? '/how' : loginHref}>
      {icon}
      {label}
    </Link>
  );
}

/**
 * Hero buttons by device (screens.md §17): Android — Google Play, iPhone — App Store, desktop — the browser.
 * On phones a line "Prefer Telegram? Open it there" follows. Everything stays available, only the order changes.
 */
export function DeviceEntry({ device, invite, desktopPrimary }: { device: Device; invite?: string | null; desktopPrimary?: string }) {
  const { t } = useTranslation();
  const links = useStoreLinks(invite);
  const loginHref = useLoginHref();
  const cta = heroCta(device);
  const label = (a: HeroAction, primary: boolean) => {
    switch (a.id) {
      case 'play':
        return t('landing.hero.play');
      case 'appstore':
        return t('landing.hero.appstore');
      case 'how':
        return t('landing.hero.how');
      case 'telegram':
        return t('landing.start.telegram');
      default:
        return primary ? desktopPrimary ?? t('landing.hero.startWeb') : t('landing.hero.web');
    }
  };
  return (
    <>
      <div className="site-cta">
        <ActionLink action={cta.primary} label={label(cta.primary, true)} links={links} loginHref={loginHref} />
        <ActionLink action={cta.secondary} label={label(cta.secondary, false)} links={links} loginHref={loginHref} />
      </div>
      {cta.telegramAlt ? (
        <p className="site-alt">
          <IconTelegram />
          {t('landing.hero.tgAlt')}{' '}
          <a href={links.telegram} target="_blank" rel="noopener noreferrer">
            {t('landing.hero.tgOpen')}
          </a>
        </p>
      ) : null}
    </>
  );
}
