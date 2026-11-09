import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { languageNames } from '@so/i18n';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { Card } from './Card';
import { Group, Row } from './Group';
import { Screen } from './Screen';
import { Segmented } from './Segmented';

function Soon() {
  const { t } = useTranslation();
  return <Card className="mt-4">{t('common.comingSoon')}</Card>;
}

/** Circle stays full width. The scene and the feed land here in a later package. */
export function CircleStub() {
  const { t } = useTranslation();
  return (
    <div className="px-4 pb-6 pt-6">
      <h1 className="text-h1 font-extrabold text-ink">{t('nav.circle')}</h1>
      <Soon />
    </div>
  );
}

export function AskStub() {
  const { t } = useTranslation();
  return (
    <Screen width="column">
      <h1 className="pt-6 text-h1 font-extrabold text-ink">{t('nav.ask')}</h1>
      <Soon />
    </Screen>
  );
}

export function AddStub() {
  const { t } = useTranslation();
  return (
    <Screen width="column">
      <h1 className="pt-6 text-h1 font-extrabold text-ink">{t('nav.add')}</h1>
      <Group className="mt-4">
        <Row variant="link" title={t('nav.qr')} to="/add/qr" />
        <Row variant="link" title={t('nav.scan')} to="/add/scan" />
      </Group>
      <Soon />
    </Screen>
  );
}

export function AddQrStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.qr')} back={{ label: t('nav.add'), to: '/add' }} width="column">
      <Soon />
    </Screen>
  );
}

export function AddScanStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.scan')} back={{ label: t('nav.add'), to: '/add' }} width="column">
      <Soon />
    </Screen>
  );
}

export function ProfileStub() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((state) => state.logout);
  const mode = useTheme((state) => state.mode);
  const setMode = useTheme((state) => state.setMode);
  const updateLanguage = trpc.settings.updateLanguage.useMutation();
  const language = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

  const onLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
    updateLanguage.mutate({ language: lang });
  };

  return (
    <Screen width="column">
      <h1 className="pt-6 text-h1 font-extrabold text-ink">{t('nav.profile')}</h1>
      <Group title={t('nav.theme')} className="mt-2">
        <div className="px-4 py-3">
          <Segmented
            variant="inline"
            label={t('nav.theme')}
            value={mode}
            onChange={setMode}
            className="max-w-full"
            options={[
              { value: 'system', label: t('common.themeAuto') },
              { value: 'light', label: t('common.themeLight') },
              { value: 'dark', label: t('common.themeDark') },
            ]}
          />
        </div>
      </Group>
      <Group title={t('settings.language')}>
        <div className="px-4 py-3">
          <select
            className="h-11 w-full rounded-md border border-line bg-surface px-3 text-body-s font-semibold text-ink"
            aria-label={t('settings.language')}
            value={language}
            onChange={(event) => onLanguage(event.target.value)}
          >
            {Object.entries(languageNames).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Group>
      <Group title={t('nav.main')}>
        <Row variant="link" title={t('nav.account')} to="/me/account" />
        <Row variant="link" title={t('nav.stake')} to="/me/stake" />
        <Row variant="link" title={t('nav.openCollections')} to="/me/open" />
        <Row variant="link" title={t('nav.history')} to="/me/history" />
        <Row variant="link" title={t('nav.help')} to="/me/help" />
        <Row variant="link" title={t('nav.settings')} to="/me/settings" />
        <Row variant="danger" title={t('settings.logout')} onClick={() => { logout(); navigate('/login'); }} />
      </Group>
      <Soon />
    </Screen>
  );
}

export function AccountStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.account')} back={{ label: t('nav.profile'), to: '/me' }} width="column">
      <Soon />
    </Screen>
  );
}

export function StakeStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.stake')} back={{ label: t('nav.profile'), to: '/me' }} width="column">
      <Soon />
    </Screen>
  );
}

export function OpenStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.openCollections')} back={{ label: t('nav.profile'), to: '/me' }} width="column">
      <Soon />
    </Screen>
  );
}

export function HistoryStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.history')} back={{ label: t('nav.profile'), to: '/me' }} width="column">
      <Soon />
    </Screen>
  );
}

export function HelpStub() {
  const { t } = useTranslation();
  return (
    <Screen title={t('nav.help')} back={{ label: t('nav.profile'), to: '/me' }} width="column">
      <Soon />
    </Screen>
  );
}

export function PeopleStub() {
  const { t } = useTranslation();
  const { ring } = useParams();
  return (
    <Screen title={t('nav.people')} back={{ label: t('nav.circle'), to: '/' }} width="column">
      <Card>
        <p>{t('common.comingSoon')}</p>
        {ring ? <p className="mt-2 text-label font-semibold text-ink-muted">{ring}</p> : null}
      </Card>
    </Screen>
  );
}

export function PersonStub() {
  const { t } = useTranslation();
  const { id } = useParams();
  return (
    <Screen title={t('nav.person')} back={{ label: t('nav.people'), to: '/people' }} width="column">
      <Card>
        <p>{t('common.comingSoon')}</p>
        {id ? <p className="mt-2 text-label font-semibold text-ink-muted">{id}</p> : null}
      </Card>
    </Screen>
  );
}

function BareStub({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[calc(100dvh-var(--sa-top))] bg-canvas">
      <Screen title={title} back={{ label: t('common.appName'), to: '/' }} width="column">
        <Soon />
      </Screen>
    </div>
  );
}

export function HowStub() {
  const { t } = useTranslation();
  return <BareStub title={t('nav.how')} />;
}

export function IntroStub() {
  const { t } = useTranslation();
  return <BareStub title={t('nav.intro')} />;
}

export function SeedStub() {
  const { t } = useTranslation();
  return <BareStub title={t('nav.seed')} />;
}

/** Old profile URLs now open the person screen. */
export function ProfileRedirect() {
  const { userId } = useParams();
  return <Navigate to={userId ? `/person/${userId}` : '/'} replace />;
}
