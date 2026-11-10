import { Trans, useTranslation } from 'react-i18next';
import { Prose, type ProseSection } from '../components/site/Prose';

// The terms are kept word for word from the previous page; the owner writes the final version.
const GITHUB = 'https://github.com/element1965/Social-organizer';
const BOT = 'https://t.me/socialorganizer_bot';
const NCMEC = 'https://www.missingkids.org/gethelpnow/cybertipline';

export function TermsPage() {
  const { t } = useTranslation();
  const gh = { gh: <a href={GITHUB} target="_blank" rel="noopener noreferrer" /> };
  const bot = { bot: <a href={BOT} target="_blank" rel="noopener noreferrer" /> };
  const ncmec = { ncmec: <a href={NCMEC} target="_blank" rel="noopener noreferrer" /> };

  const sections: ProseSection[] = [
    {
      id: 'about',
      title: t('legal.termsDoc.s1Title'),
      body: <p>{t('legal.termsDoc.s1')}</p>,
    },
    {
      id: 'acceptance',
      title: t('legal.termsDoc.s2Title'),
      body: <p>{t('legal.termsDoc.s2')}</p>,
    },
    {
      id: 'accounts',
      title: t('legal.termsDoc.s3Title'),
      body: (
        <ul>
          <li>{t('legal.termsDoc.s3a')}</li>
          <li>{t('legal.termsDoc.s3b')}</li>
          <li>{t('legal.termsDoc.s3c')}</li>
          <li>{t('legal.termsDoc.s3d')}</li>
        </ul>
      ),
    },
    {
      id: 'how-it-works',
      title: t('legal.termsDoc.s4Title'),
      body: (
        <>
          <p>{t('legal.termsDoc.s4lead')}</p>
          <ul>
            <li>{t('legal.termsDoc.s4a')}</li>
            <li>{t('legal.termsDoc.s4b')}</li>
            <li>{t('legal.termsDoc.s4c')}</li>
            <li>{t('legal.termsDoc.s4d')}</li>
          </ul>
        </>
      ),
    },
    {
      id: 'conduct',
      title: t('legal.termsDoc.s5Title'),
      body: (
        <>
          <p>{t('legal.termsDoc.s5lead')}</p>
          <ul>
            <li>{t('legal.termsDoc.s5a')}</li>
            <li>{t('legal.termsDoc.s5b')}</li>
            <li>{t('legal.termsDoc.s5c')}</li>
            <li>{t('legal.termsDoc.s5d')}</li>
            <li>{t('legal.termsDoc.s5e')}</li>
          </ul>
        </>
      ),
    },
    {
      id: 'financial-disclaimer',
      title: t('legal.termsDoc.s6Title'),
      body: (
        <>
          <p>{t('legal.termsDoc.s6')}</p>
          <p>{t('legal.termsDoc.s6b')}</p>
        </>
      ),
    },
    {
      id: 'liability',
      title: t('legal.termsDoc.s7Title'),
      body: <p>{t('legal.termsDoc.s7')}</p>,
    },
    {
      id: 'open-source',
      title: t('legal.termsDoc.s8Title'),
      body: (
        <p>
          <Trans i18nKey="legal.termsDoc.s8" components={gh} />
        </p>
      ),
    },
    {
      // Kept as `child-safety`: store listings link to /terms#child-safety.
      id: 'child-safety',
      title: t('legal.termsDoc.s9Title'),
      body: (
        <>
          <p>{t('legal.termsDoc.s9a')}</p>
          <p>{t('legal.termsDoc.s9lead')}</p>
          <ul>
            <li>{t('legal.termsDoc.s9b')}</li>
            <li>{t('legal.termsDoc.s9c')}</li>
            <li>{t('legal.termsDoc.s9d')}</li>
            <li>{t('legal.termsDoc.s9e')}</li>
          </ul>
          <p>
            <Trans i18nKey="legal.termsDoc.s9f" components={ncmec} />
          </p>
          <p>
            <Trans i18nKey="legal.termsDoc.s9g" components={bot} />
          </p>
        </>
      ),
    },
    {
      id: 'changes',
      title: t('legal.termsDoc.s10Title'),
      body: <p>{t('legal.termsDoc.s10')}</p>,
    },
    {
      id: 'contact',
      title: t('legal.termsDoc.s11Title'),
      body: (
        <p>
          <Trans i18nKey="legal.termsDoc.s11" components={bot} />
        </p>
      ),
    },
  ];

  return <Prose doc="terms" title={t('legal.termsTitle')} meta={t('legal.termsMeta')} sections={sections} />;
}
