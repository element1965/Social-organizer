import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@so/i18n/languages';
import { MIN_OBLIGATION_AMOUNT } from '@so/shared';
import { STORE_URL } from '../lib/device';
import { Avatar } from '../components/ui2';
import { formatIsolatedMoney as pressAmount } from '../components/ui2/format';
import { Reveal, useLivePeopleCount } from '../components/site/hooks';
import { GITHUB_URL } from '../components/site/SiteHeader';
import { SitePage } from '../components/site/SitePage';
import { REPORT_URL, TEAM, TEAM_ORGS, TEAM_URL } from '../components/site/team';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
/** The example Need of the about paragraph: N dollars reach up to N people. */
const EXAMPLE_NEED = 300;

/** Brand files, served from apps/web/public. */
const BRAND = [
  { id: 'icon', src: '/icon-512.png', file: 'social-organizer-icon-512.png', w: 512, h: 512 },
  { id: 'small', src: '/apple-touch-icon.png', file: 'social-organizer-icon-180.png', w: 180, h: 180 },
  { id: 'wide', src: '/og-image.png', file: 'social-organizer-logo-1200x630.png', w: 1200, h: 630 },
] as const;

/** Store screenshots copied from play-store-assets/en-US into apps/web/public/press (PNG to download, WebP preview). */
const SHOTS = [
  { id: 'circle', w: 1080, h: 1920, preview: 360 },
  { id: 'need', w: 1080, h: 1920, preview: 360 },
  { id: 'ask', w: 1080, h: 1920, preview: 360 },
  { id: 'banner', name: 'feature-graphic', w: 1024, h: 500, preview: 720 },
] as const;

function size(w: number, h: number): string {
  return `${w} × ${h} PNG`;
}

function Download({ href, file, label, children }: { href: string; file: string; label: string; children: ReactNode }) {
  return (
    <a className="pr-dl" href={href} download={file} aria-label={label}>
      {children}
    </a>
  );
}

/**
 * Press kit (`/press`, audit L12): what the project is, who makes it, facts that come from the code and the live
 * count, the logo and screenshots to download, and how to reach the team through Telegram or GitHub.
 */
export function PressPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'en';
  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  const people = useLivePeopleCount();
  const date = useMemo(() => new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date()), [lang]);
  const download = t('press.download');

  const link = (href: string) => <a href={href} {...ext} />;
  const facts: { id: string; value: ReactNode }[] = [
    { id: 'price', value: t('press.facts.priceValue') },
    { id: 'money', value: t('press.facts.moneyValue') },
    { id: 'code', value: <Trans i18nKey="press.facts.codeValue" components={{ code: link(GITHUB_URL) }} /> },
    {
      id: 'platforms',
      value: (
        <Trans
          i18nKey="press.facts.platformsValue"
          components={{ web: <Link to="/login" />, play: link(STORE_URL.play), ios: link(STORE_URL.appstore), tg: link(STORE_URL.telegram) }}
        />
      ),
    },
    { id: 'languages', value: nf.format(SUPPORTED_LANGUAGES.length) },
    ...(people === undefined
      ? []
      : [{ id: 'network', value: <><b>{nf.format(people)}</b> {t('landing.v2.join.nowDate', { date })}</> }]),
    { id: 'theory', value: <Trans i18nKey="press.facts.theoryValue" components={{ report: link(REPORT_URL) }} /> },
  ];

  return (
    <SitePage title={t('press.meta.title')} description={t('press.meta.description')} className="site-press">
      <Reveal as="section" className="site-hero1" aria-labelledby="press-title">
        <h1 id="press-title">{t('press.hero.title')}</h1>
        <p className="lead">
          {t('press.hero.lead', {
            need: pressAmount(EXAMPLE_NEED),
            reach: nf.format(EXAMPLE_NEED),
            min: pressAmount(MIN_OBLIGATION_AMOUNT),
          })}
        </p>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="press-people">
        <h2 id="press-people">{t('team.title')}</h2>
        <ul className="pr-people">
          {TEAM.map((id) => {
            const name = t(`team.${id}.name`);
            const org = TEAM_ORGS[id];
            return (
              <li key={id}>
                <Avatar name={name} size={48} />
                <div>
                  <b>{name}</b>
                  <span>{t(`team.${id}.role`)}</span>
                  {org && (
                    <a className="pr-org" href={org.url} target="_blank" rel="noopener noreferrer">
                      {org.name}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="press-facts">
        <h2 id="press-facts">{t('press.facts.title')}</h2>
        <dl className="pr-facts">
          {facts.map(({ id, value }) => (
            <div key={id}>
              <dt>{t(`press.facts.${id}`)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="press-brand">
        <h2 id="press-brand">{t('press.brand.title')}</h2>
        <p className="lead">{t('press.brand.note')}</p>
        <ul className="pr-files">
          {BRAND.map(({ id, src, file, w, h }) => (
            <li key={id} className={id === 'wide' ? 'wide' : undefined}>
              <div className="pr-thumb brand">
                <img src={src} alt="" width={w} height={h} loading="lazy" decoding="async" />
              </div>
              <p>{t(`press.brand.${id}`)}</p>
              <span className="pr-size"><bdi dir="ltr">{size(w, h)}</bdi></span>
              <Download href={src} file={file} label={`${download}: ${t(`press.brand.${id}`)}`}>
                {download}
              </Download>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="press-shots">
        <h2 id="press-shots">{t('press.shots.title')}</h2>
        <p className="lead">{t('press.shots.lead')}</p>
        <ul className="pr-files shots">
          {SHOTS.map((shot) => {
            const name = 'name' in shot ? shot.name : 'screen-' + shot.id;
            const caption = t(`press.shots.${shot.id}`);
            return (
              <li key={shot.id} className={shot.id === 'banner' ? 'wide' : undefined}>
                <div className="pr-thumb">
                  <img
                    src={`/press/${name}-${shot.preview}.webp`}
                    alt={caption}
                    width={shot.w}
                    height={shot.h}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <p>{caption}</p>
                <span className="pr-size"><bdi dir="ltr">{size(shot.w, shot.h)}</bdi></span>
                <Download href={`/press/${name}.png`} file={`social-organizer-${name}.png`} label={`${download}: ${caption}`}>
                  {download}
                </Download>
              </li>
            );
          })}
        </ul>
      </Reveal>

      <Reveal as="section" className="site-endcta" aria-labelledby="press-contact">
        <div className="site-endcta-copy">
          <h2 id="press-contact">{t('press.contact.title')}</h2>
          <p className="site-note">{t('press.contact.lead')}</p>
        </div>
        <a className="site-btn primary" href={TEAM_URL} {...ext}>
          {t('landing.v2.join.cta')}
        </a>
        <a className="site-btn secondary" href={`${GITHUB_URL}/issues`} {...ext}>
          GitHub
        </a>
      </Reveal>
    </SitePage>
  );
}
