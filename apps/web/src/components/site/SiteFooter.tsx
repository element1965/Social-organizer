import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GITHUB_URL, HELP_URL, LanguageSelect, SiteBrand } from './SiteHeader';

/** Site footer. On phones it also carries the header navigation (How it works, Help). */
export function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer className="site-foot">
      <SiteBrand small />
      <span>{t('landing.site.footerNote')}</span>
      <nav className="links" aria-label={t('landing.site.nav')}>
        <Link to="/how" className="phone-only">
          {t('landing.site.how')}
        </Link>
        <a href={HELP_URL} target="_blank" rel="noopener noreferrer" className="phone-only">
          {t('landing.site.help')}
        </a>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          {t('landing.site.github')}
        </a>
        <Link to="/privacy">{t('landing.site.privacy')}</Link>
        <Link to="/terms">{t('landing.site.terms')}</Link>
        <Link to="/delete-account">{t('landing.site.deleteAccount')}</Link>
        <LanguageSelect />
      </nav>
    </footer>
  );
}
