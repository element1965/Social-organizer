import { Trans, useTranslation } from 'react-i18next';
import { Prose, type ProseSection } from '../components/site/Prose';

// The policy text is kept word for word from the previous page; the owner writes the final version.
const GITHUB = 'https://github.com/element1965/Social-organizer';
const BOT = 'https://t.me/socialorganizer_bot';

export function PrivacyPage() {
  const { t } = useTranslation();
  const b = { b: <strong /> };
  const gh = { gh: <a href={GITHUB} target="_blank" rel="noopener noreferrer" /> };
  const bot = { bot: <a href={BOT} target="_blank" rel="noopener noreferrer" /> };

  const sections: ProseSection[] = [
    {
      id: 'introduction',
      title: t('legal.policy.s1Title'),
      body: <p>{t('legal.policy.s1')}</p>,
    },
    {
      id: 'data-we-collect',
      title: t('legal.policy.s2Title'),
      body: (
        <ul>
          <li><Trans i18nKey="legal.policy.s2a" components={b} /></li>
          <li><Trans i18nKey="legal.policy.s2b" components={b} /></li>
          <li><Trans i18nKey="legal.policy.s2c" components={b} /></li>
          <li><Trans i18nKey="legal.policy.s2d" components={b} /></li>
        </ul>
      ),
    },
    {
      id: 'how-we-use',
      title: t('legal.policy.s3Title'),
      body: (
        <ul>
          <li>{t('legal.policy.s3a')}</li>
          <li>{t('legal.policy.s3b')}</li>
          <li>{t('legal.policy.s3c')}</li>
          <li>{t('legal.policy.s3d')}</li>
        </ul>
      ),
    },
    {
      id: 'data-sharing',
      title: t('legal.policy.s4Title'),
      body: (
        <>
          <p>{t('legal.policy.s4lead')}</p>
          <ul>
            <li><Trans i18nKey="legal.policy.s4a" components={b} /></li>
            <li><Trans i18nKey="legal.policy.s4b" components={b} /></li>
            <li><Trans i18nKey="legal.policy.s4c" components={b} /></li>
          </ul>
        </>
      ),
    },
    {
      id: 'storage-security',
      title: t('legal.policy.s5Title'),
      body: <p>{t('legal.policy.s5')}</p>,
    },
    {
      id: 'your-rights',
      title: t('legal.policy.s6Title'),
      body: (
        <>
          <p>{t('legal.policy.s6lead')}</p>
          <ul>
            <li>{t('legal.policy.s6a')}</li>
            <li>{t('legal.policy.s6b')}</li>
            <li>{t('legal.policy.s6c')}</li>
            <li>{t('legal.policy.s6d')}</li>
          </ul>
        </>
      ),
    },
    {
      id: 'open-source',
      title: t('legal.policy.s7Title'),
      body: (
        <p>
          <Trans i18nKey="legal.policy.s7" components={gh} />
        </p>
      ),
    },
    {
      id: 'contact',
      title: t('legal.policy.s8Title'),
      body: (
        <p>
          <Trans i18nKey="legal.policy.s8" components={bot} />
        </p>
      ),
    },
  ];

  return <Prose doc="privacy" title={t('legal.privacyTitle')} meta={t('legal.privacyMeta')} sections={sections} />;
}
