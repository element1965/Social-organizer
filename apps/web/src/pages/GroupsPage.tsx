import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ASK_MIN_DIRECT, ASK_MIN_NETWORK, MIN_OBLIGATION_AMOUNT } from '@so/shared';
import { TELEGRAM_BOT_URL, TELEGRAM_BOT_USERNAME } from '../lib/deployment';
import { heroCta, useDevice } from '../lib/device';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { permanentInviteUrl } from '../components/add/links';
import { useStoreLinks } from '../components/site/DeviceEntry';
import { Reveal } from '../components/site/hooks';
import { useLoginHref } from '../components/site/SiteHeader';
import { SitePage } from '../components/site/SitePage';
import { formatIsolatedMoney } from '../components/ui2/format';

const B = { b: <b /> };
const TEAM_URL = `${TELEGRAM_BOT_URL}?start=team`;
/** Size of the group in the "together" example: with 5 confirmed among 11, everyone has the other 10 in the network. */
const GROUP_SIZE = ASK_MIN_NETWORK + 1;

type TextId = 'invite' | 'explain' | 'confirm';
const TEXT_IDS: TextId[] = ['invite', 'explain', 'confirm'];

/** Button names as each language shows them in the app, so the texts quote what people will see. */
type ButtonNames = Record<'add' | 'share' | 'known' | 'myQr' | 'scan', string>;

/**
 * Chat texts in Kiswahili and Tagalog for the first community campaigns (Kenya, the Philippines).
 * DRAFTS, NOT REVIEWED BY A NATIVE SPEAKER: keep SHOW_EXTRA_TEXT_LANGUAGES false until a native organiser
 * or the local partner has checked them. Neither language is an app locale, so these people see the app in
 * English and the texts quote the English button names. Placeholders are the same as in `groups.texts.*`.
 */
const SHOW_EXTRA_TEXT_LANGUAGES = false;
const EXTRA_TEXTS: Record<'sw' | 'tl', { name: string; texts: Record<TextId, string> }> = {
  sw: {
    name: 'Kiswahili',
    texts: {
      invite:
        'Nimejiunga na Social Organizer. Huko, watu wanaofahamiana ana kwa ana hujenga mtandao. Mmoja wetu akiripoti Need kutokana na shida kubwa, kama kupoteza kazi au kuhitaji upasuaji wa haraka, taarifa huanza kuwafikia watu wanaomfahamu aliyeripoti, kisha watu wanaofahamiana nao. Hakuna pesa inayopita kwenye programu. Jiunge kupitia kiungo changu, nami nitathibitisha kwamba tunafahamiana: {{link}}',
      explain:
        'Social Organizer inaunganisha watu wanaofahamiana ana kwa ana. Mmoja wetu akiripoti Need, kila mtu anaamua mwenyewe kama atashiriki, kuanzia {{min}}, na pesa yoyote hupita moja kwa moja kati ya watu. {{link}}',
      confirm:
        'Kwa wote waliojiunga: ili kuripoti Need, kila mmoja wetu anahitaji watu 5 wanaotufahamu waliothibitisha, na watu 10 kwenye mtandao. Weka kiungo chako hapa (“{{add}}” → “{{share}}”). Fungua viungo vya watu unaowafahamu ana kwa ana na ubonyeze “{{known}}”. Mtu akija kupitia kiungo chako, mthibitishe. Kwenye mkutano ujao tutafanya haraka zaidi: “{{myQr}}” na “{{scan}}”.',
    },
  },
  tl: {
    name: 'Tagalog',
    texts: {
      invite:
        'Sumali ako sa Social Organizer. Doon, bumubuo ng network ang mga taong personal na magkakakilala. Kapag may nag-ulat ng Need dahil sa matinding problema, gaya ng pagkawala ng trabaho o pangangailangan ng agarang operasyon, unang makakatanggap ng abiso ang mga kakilala ng nag-ulat, saka ang mga kakilala nila. Walang perang dumadaan sa app. Sumali ka gamit ang link ko, at kukumpirmahin kong magkakilala tayo: {{link}}',
      explain:
        'Pinagsasama ng Social Organizer ang mga taong personal na magkakakilala. Kapag may nag-ulat ng Need sa atin, bawat isa ang magpapasya kung sasali, mula {{min}}, at ang anumang pera ay direktang dumadaan sa pagitan ng mga tao. {{link}}',
      confirm:
        'Sa lahat ng sumali na: para makapag-ulat ng Need, kailangan ng bawat isa sa atin ng 5 kumpirmadong kakilala at 10 tao sa network. I-post dito ang sarili mong link (“{{add}}” → “{{share}}”). Buksan ang mga link ng mga taong personal mong kilala at pindutin ang “{{known}}”. Kapag may dumating sa link mo, kumpirmahin sila. Sa susunod nating pagkikita, mas mabilis na: “{{myQr}}” at “{{scan}}”.',
    },
  },
};
type TextLanguage = 'page' | keyof typeof EXTRA_TEXTS;

function buttonNames(t: TFunction): ButtonNames {
  return { add: t('nav.add'), share: t('add.share'), known: t('invite.known'), myQr: t('add.myQr'), scan: t('add.scan') };
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => values[key] ?? all);
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('clipboard');
}

/**
 * "For groups" (`/groups`, audit L11): a short page for the person who brings an existing group (a chama, a
 * paluwagan, a church group) into Social Organizer. It says why a group starts faster than one person (the
 * request thresholds), what stays the group's own, how to get the first people confirmed, and gives texts to copy
 * into the group chat. It only points at what the app already has: the personal link, Share, the live QR.
 */
export function GroupsPage() {
  const { t, i18n } = useTranslation();
  const device = useDevice();
  const links = useStoreLinks();
  const loginHref = useLoginHref();
  const signedIn = useAuth((s) => s.isAuthenticated);
  const profile = trpc.user.me.useQuery(undefined, { enabled: signedIn, retry: 1 });
  const slug = signedIn ? profile.data?.referralSlug : null;
  const ownLink = slug ? permanentInviteUrl(slug) : null;
  const linkPending = signedIn && profile.isPending;
  const [lang, setLang] = useState<TextLanguage>('page');
  const [copied, setCopied] = useState<TextId | null>(null);
  const [copyFailed, setCopyFailed] = useState<TextId | null>(null);
  const arr = (key: string) => t(key, { returnObjects: true }) as unknown as string[];

  const pageButtons = buttonNames(t);
  const min = formatIsolatedMoney(MIN_OBLIGATION_AMOUNT);
  const link = ownLink ?? t('groups.texts.placeholder');
  const textFor = (id: TextId): string => {
    if (lang === 'page') return t(`groups.texts.${id}`, { ...pageButtons, link, min });
    // The extra languages are not app locales: their readers see the English buttons
    return fill(EXTRA_TEXTS[lang].texts[id], { ...buttonNames(i18n.getFixedT('en')), link, min });
  };

  const copy = async (id: TextId) => {
    setCopyFailed(null);
    try {
      await copyToClipboard(textFor(id));
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setCopied(null);
      setCopyFailed(id);
    }
  };

  const primary = heroCta(device).primary;
  const startHref = primary.id === 'play' ? links.play : primary.id === 'appstore' ? links.appstore : null;
  const count = (n: number, goal: number) => t('path.of', { count: n, goal });

  return (
    <SitePage title={t('groups.meta.title')} description={t('groups.meta.description')} className="site-groups">
      <Reveal as="section" className="site-hero1" aria-labelledby="groups-title">
        <h1 id="groups-title">{t('groups.hero.title')}</h1>
        <p className="lead">{t('groups.hero.lead')}</p>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="groups-why">
        <h2 id="groups-why">{t('groups.why.title')}</h2>
        <p className="lead">
          <Trans i18nKey="groups.why.lead" values={{ direct: ASK_MIN_DIRECT, network: ASK_MIN_NETWORK }} components={B} />
        </p>
        <div className="gr-counts">
          <div className="gr-count">
            <h3>{t('groups.why.aloneLabel')}</h3>
            <dl>
              <dt>{t('path.circle')}</dt>
              <dd>{count(0, ASK_MIN_DIRECT)}</dd>
              <dt>{t('path.network')}</dt>
              <dd>{count(0, ASK_MIN_NETWORK)}</dd>
            </dl>
            <p>{t('groups.why.alone')}</p>
          </div>
          <div className="gr-count met">
            <h3>{t('groups.why.groupLabel', { n: GROUP_SIZE })}</h3>
            <dl>
              <dt>{t('path.circle')}</dt>
              <dd>{count(ASK_MIN_DIRECT, ASK_MIN_DIRECT)}</dd>
              <dt>{t('path.network')}</dt>
              <dd>{count(ASK_MIN_NETWORK, ASK_MIN_NETWORK)}</dd>
            </dl>
            <p>{t('groups.why.group', { n: GROUP_SIZE, direct: ASK_MIN_DIRECT })}</p>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="groups-own">
        <h2 id="groups-own">{t('groups.own.title')}</h2>
        <p className="lead">{t('groups.own.lead')}</p>
        <p className="gr-p">{t('groups.own.text1', { min })}</p>
        <p className="gr-p">{t('groups.own.text2')}</p>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="groups-steps">
        <h2 id="groups-steps">{t('groups.steps.title')}</h2>
        <ol className="gr-steps">
          {(['s1', 's2', 's3', 's4'] as const).map((s) => (
            <li key={s}>{t(`groups.steps.${s}`, { ...pageButtons, stake: t('nav.stake'), direct: ASK_MIN_DIRECT })}</li>
          ))}
        </ol>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="groups-texts">
        <h2 id="groups-texts">{t('groups.texts.title')}</h2>
        <p className="lead">{t('groups.texts.lead')}</p>
        <p className="site-note">
          {ownLink ? t('groups.texts.linkMine') : t('groups.texts.linkNote', { add: pageButtons.add, placeholder: t('groups.texts.placeholder') })}
        </p>
        {SHOW_EXTRA_TEXT_LANGUAGES ? (
          <div className="site-chips" role="group" aria-label={t('groups.texts.languages')}>
            {(['page', ...Object.keys(EXTRA_TEXTS)] as TextLanguage[]).map((l) => (
              <button key={l} type="button" aria-pressed={l === lang} onClick={() => setLang(l)}>
                {l === 'page' ? t('groups.texts.pageLanguage') : EXTRA_TEXTS[l].name}
              </button>
            ))}
          </div>
        ) : null}
        <div className="gr-texts">
          {TEXT_IDS.map((id) => (
            <article key={id} className="gr-text" aria-labelledby={`groups-text-${id}`}>
              <h3 id={`groups-text-${id}`}>{t(`groups.texts.${id}Label`)}</h3>
              <p lang={lang === 'page' ? undefined : lang}>{textFor(id)}</p>
              <div className="gr-copy">
                <button
                  type="button"
                  className="site-btn secondary md"
                  disabled={linkPending && id !== 'confirm'}
                  onClick={() => void copy(id)}
                >
                  {copied === id ? t('groups.texts.copied') : t('groups.texts.copy')}
                </button>
                <span role="status" aria-live="polite">
                  {copyFailed === id ? t('groups.texts.copyFailed') : ''}
                </span>
              </div>
            </article>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="site-sec" aria-labelledby="groups-honest">
        <h2 id="groups-honest">{t('groups.honest.title')}</h2>
        <ul className="gr-honest">
          {arr('groups.honest.list').map((line) => (
            <li key={line}>{line}</li>
          ))}
          <li>{t('landing.v2.join.safe', { bot: '@' + TELEGRAM_BOT_USERNAME })}</li>
        </ul>
      </Reveal>

      <Reveal as="section" className="site-endcta" aria-labelledby="groups-cta">
        <div className="site-endcta-copy">
          <h2 id="groups-cta">{t('groups.cta.title')}</h2>
          <p className="site-note">{t('groups.cta.note')}</p>
        </div>
        {startHref ? (
          <a className="site-btn primary" href={startHref} target="_blank" rel="noopener noreferrer">
            {t('how.cta.start')}
          </a>
        ) : (
          <Link className="site-btn primary" to={loginHref}>
            {t('how.cta.start')}
          </Link>
        )}
        <a className="site-btn secondary" href={TEAM_URL} target="_blank" rel="noopener noreferrer">
          {t('landing.v2.join.cta')}
        </a>
      </Reveal>
    </SitePage>
  );
}
