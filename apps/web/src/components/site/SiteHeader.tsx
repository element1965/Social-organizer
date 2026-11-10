import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { languageNames } from '@so/i18n/languages';
import { useTheme } from '../../hooks/useTheme';
import { BrandMark } from '../ui2/BrandMark';
import { LanguageSheet, useCurrentLanguage } from '../profile/LanguageSheet';
import { IconGlobe } from './icons';
import { IconMoon, IconSun } from '../ui2/icons';

export const GITHUB_URL = 'https://github.com/element1965/Social-organizer';
/** Guests have no in-app Help: the support bot answers questions. */
export const HELP_URL = 'https://t.me/socialorganizer_bot';

export type SiteSection = 'how' | 'help' | 'legal' | undefined;

export function SiteBrand({ small }: { small?: boolean } = {}) {
  const { t } = useTranslation();
  return (
    <Link to="/" className="site-brand">
      <BrandMark size={small ? 24 : 30} />
      {t('landing.site.brand')}
    </Link>
  );
}

/** True when html.dark is on (the effective theme, whatever the stored mode). */
function useIsDark(): boolean {
  const mode = useTheme((s) => s.mode);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains('dark'));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, [mode]);
  return dark;
}

/** Moon / sun button. Same `theme` key as the app's Auto / Light / Dark setting. */
export function ThemeButton() {
  const { t } = useTranslation();
  const setMode = useTheme((s) => s.setMode);
  const dark = useIsDark();
  const label = dark ? t('landing.site.themeLight') : t('landing.site.themeDark');
  return (
    <button type="button" className="site-ibtn" data-theme-toggle aria-label={label} title={label} onClick={() => setMode(dark ? 'light' : 'dark')}>
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}

/** Language chip ("🌐 EN") that opens the shared language sheet. */
export function LanguageSelect() {
  const { t } = useTranslation();
  const current = useCurrentLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="site-lang" aria-haspopup="dialog" aria-label={`${t('landing.site.language')}: ${languageNames[current]}`} onClick={() => setOpen(true)}>
        <IconGlobe />
        <span className="code">{current}</span>
      </button>
      <LanguageSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Sign-in link; keeps the `redirect` the guest came with. */
export function useLoginHref(): string {
  const [params] = useSearchParams();
  const redirect = params.get('redirect');
  return redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login';
}

/** Site header: 72 px; on phones (container under 600 px) only the brand, theme and sign-in. */
export function SiteHeader({ active }: { active?: SiteSection }) {
  const { t } = useTranslation();
  const loginHref = useLoginHref();
  return (
    <header className="site-top">
      <SiteBrand />
      <nav aria-label={t('landing.site.nav')}>
        <Link to="/how" aria-current={active === 'how' ? 'page' : undefined}>
          {t('landing.site.how')}
        </Link>
        <a href={HELP_URL} target="_blank" rel="noopener noreferrer">
          {t('landing.site.help')}
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          {t('landing.site.github')}
        </a>
      </nav>
      <div className="right">
        <LanguageSelect />
        <ThemeButton />
        <Link to={loginHref} className="site-btn primary md">
          {t('landing.site.login')}
        </Link>
      </div>
    </header>
  );
}
