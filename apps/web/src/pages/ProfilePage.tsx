import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { languageNames, type SupportedLanguage } from '@so/i18n/languages';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Avatar } from '../components/ui2/Avatar';
import { Group, Row } from '../components/ui2/Group';
import { Pill } from '../components/ui2/Pill';
import { Screen } from '../components/ui2/Screen';
import { Segmented } from '../components/ui2/Segmented';
import { formatMoney } from '../components/ui2/format';
import { AdminReviews } from '../components/moderation/AdminReviews';
import { AboutSheet } from '../components/profile/AboutSheet';
import { LogoutSheet } from '../components/onboarding/AccountSheets';
import { LanguageSheet } from '../components/profile/LanguageSheet';
import { QueryState } from '../components/profile/QueryState';
import { countForm, isOpenParticipation, openCountKey } from '../components/profile/collections';
import { ACCOUNT_NOTICE_KEY, publicHost } from '../components/profile/constants';
import { formatLongDate } from '../components/profile/dates';
import { applyFontScale } from '../components/profile/fontScale';

function networkKey(count: number): 'profile.networkOne' | 'profile.networkFew' | 'profile.networkMany' {
  const form = countForm(count);
  if (form === 'one') return 'profile.networkOne';
  if (form === 'few') return 'profile.networkFew';
  return 'profile.networkMany';
}

type ThemeChoice = 'system' | 'light' | 'dark';

function themeToApi(choice: ThemeChoice): 'SYSTEM' | 'LIGHT' | 'DARK' {
  if (choice === 'system') return 'SYSTEM';
  if (choice === 'light') return 'LIGHT';
  return 'DARK';
}

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const logout = useAuth((state) => state.logout);
  const mode = useTheme((state) => state.mode);
  const setMode = useTheme((state) => state.setMode);
  const push = usePushNotifications();

  const me = trpc.user.me.useQuery();
  const settings = trpc.settings.get.useQuery();
  const access = trpc.collection.askAccess.useQuery();
  const caps = trpc.stats.networkCapabilities.useQuery(undefined, {
    enabled: access.isSuccess && access.data.networkCanHelp == null,
  });
  const active = trpc.collection.myActive.useQuery();
  const participating = trpc.collection.myParticipating.useQuery();
  const admin = trpc.faq.isAdmin.useQuery();
  const isAdmin = admin.data?.isAdmin === true;
  const conversations = trpc.support.listConversations.useQuery(undefined, { enabled: isAdmin });

  const updateTheme = trpc.settings.updateTheme.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateSound = trpc.settings.updateSound.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateFont = trpc.settings.updateFontScale.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateReminder = trpc.settings.updateNotifyRenewalReminder.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const updateStart = trpc.settings.updateNotifyRenewalStart.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const updateChannel = trpc.settings.updateNotifyChannel.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const updateNewCollections = trpc.settings.updateNotifyNewCollections.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });

  const [notesOpen, setNotesOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [autosaveNote, setAutosaveNote] = useState(false);

  useEffect(() => {
    if (settings.data) applyFontScale(settings.data.fontScale);
  }, [settings.data]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(ACCOUNT_NOTICE_KEY) === '1') {
        sessionStorage.removeItem(ACCOUNT_NOTICE_KEY);
        setAutosaveNote(true);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const loading = me.isLoading || settings.isLoading;
  const failed = me.isError || settings.isError || !me.data || !settings.data;

  const retry = () => {
    void me.refetch();
    void settings.refetch();
  };

  if (loading || failed || !me.data || !settings.data) {
    return (
      <Screen title={t('nav.profile')} width="column">
        <QueryState isLoading={loading} isError={failed} onRetry={retry} />
      </Screen>
    );
  }

  const profile = me.data;
  const prefs = settings.data;
  const langCode = (i18n.language.split('-')[0] || 'en') as SupportedLanguage;
  const languageLabel = langCode in languageNames ? languageNames[langCode] : langCode;
  const canHelp = access.data?.networkCanHelp ?? caps.data?.total ?? null;
  const openCount = active.data && participating.data
    ? active.data.length + participating.data.filter((row) => isOpenParticipation(row, profile.id)).length
    : null;
  const cyclesOn = prefs.notifyRenewalReminder && prefs.notifyRenewalStart;
  const soundOn = prefs.soundEnabled;
  const pushState = push.isSupported ? push.isSubscribed : null;
  const newCollectionsOn = prefs.notifyNewCollections;
  const flags = [cyclesOn, newCollectionsOn, soundOn, ...(pushState === null ? [] : [pushState])];
  // One external channel for event notifications (SO-45): the person's choice or the automatic one
  const channel = prefs.effectiveChannel === 'TELEGRAM' ? 'TELEGRAM' : 'APP';
  const channelHint = [
    channel === 'TELEGRAM' ? t('settings.notifyChannelHintTelegram') : t('settings.notifyChannelHintApp'),
    prefs.telegramLinked ? null : t('profile.notifyTelegramNotLinked'),
    channel === 'APP' && !prefs.hasPush && push.isSupported ? t('settings.notifyPushOff') : null,
  ].filter(Boolean).join(' ');
  const onCount = flags.filter(Boolean).length;
  const notesValue = onCount === 0
    ? t('profile.notificationsOff')
    : onCount === flags.length
      ? t('profile.notificationsAll')
      : t('profile.notificationsSome');
  const slugLine = profile.referralSlug ? `${publicHost()}/${profile.referralSlug}` : publicHost();
  const since = t('profile.memberSince', { date: formatLongDate(profile.createdAt, i18n.language) });
  const supportCount = conversations.data?.length ?? 0;

  const chooseTheme = (next: ThemeChoice) => {
    setMode(next);
    updateTheme.mutate({ theme: themeToApi(next) });
  };

  const setCycles = (enabled: boolean) => {
    updateReminder.mutate({ enabled });
    updateStart.mutate({ enabled });
  };

  const signOut = () => {
    logout();
    // A full load, so the shell gate does not send /me to the landing before the sign-in screen opens
    window.location.replace('/login');
  };

  return (
    <Screen title={t('nav.profile')} width="column">
      <Link to="/me/account" className="so-focus mt-2 flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card">
        <Avatar name={profile.name} src={profile.photoUrl} size={64} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-title font-bold text-ink">{profile.name}</span>
          <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{`${slugLine} · ${since}`}</span>
        </span>
        <span className="text-body-s font-bold text-care">{t('profile.editCard')}</span>
      </Link>
      {autosaveNote ? <p className="mt-2 px-1 text-label font-semibold text-ink-muted">{t('account.autosaveDropped')}</p> : null}

      <Group title={t('profile.participation')}>
        <Row
          title={t('circle.stats.canHelp')}
          subtitle={access.data ? t(networkKey(access.data.networkCount), { count: access.data.networkCount }) : undefined}
          variant="value"
          value={canHelp == null ? undefined : formatMoney(canHelp)}
          chevron={false}
        />
        <Row
          title={t('profile.minimum')}
          variant="value"
          value={profile.monthlyBudget == null ? t('profile.stakeEmpty') : formatMoney(profile.monthlyBudget)}
          to="/me/stake"
        />
        <Row
          title={t('profile.collections')}
          variant="value"
          value={openCount == null ? undefined : t(openCountKey(openCount), { count: openCount })}
          to="/me/history"
        />
      </Group>

      <Group title={t('settings.title')}>
        <div className="flex min-h-row flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span className="text-body font-body text-ink">{t('nav.theme')}</span>
          <Segmented
            variant="inline"
            label={t('nav.theme')}
            value={mode}
            onChange={chooseTheme}
            options={[
              { value: 'system', label: t('common.themeAuto') },
              { value: 'light', label: t('common.themeLight') },
              { value: 'dark', label: t('common.themeDark') },
            ]}
          />
        </div>
        <div>
          <Row
            title={t('profile.notifications')}
            variant="value"
            value={notesValue}
            onClick={() => setNotesOpen((open) => !open)}
          />
          {notesOpen ? (
            <div className="border-t border-line-soft">
              <div className="flex min-h-row flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-body font-body text-ink">{t('profile.notifyChannel')}</span>
                <Segmented
                  variant="inline"
                  label={t('settings.notifyChannelLabel')}
                  value={channel}
                  onChange={(next) => {
                    if (next !== channel && !updateChannel.isPending) updateChannel.mutate({ channel: next });
                  }}
                  options={[
                    { value: 'APP', label: t('settings.notifyChannelApp') },
                    { value: 'TELEGRAM', label: t('settings.notifyChannelTelegram'), disabled: !prefs.telegramLinked },
                  ]}
                />
              </div>
              <p className="px-4 pb-3 text-label font-semibold text-ink-muted">{channelHint}</p>
              <Row
                title={t('settings.notifyNewCollections')}
                variant="toggle"
                checked={newCollectionsOn}
                onCheckedChange={(enabled) => updateNewCollections.mutate({ enabled })}
              />
              <p className="px-4 pb-3 text-label font-semibold text-ink-muted">{t('settings.notifyNewCollectionsHint')}</p>
              <Row
                title={t('profile.notifyCycles')}
                variant="toggle"
                checked={cyclesOn}
                onCheckedChange={setCycles}
              />
              <p className="px-4 pb-3 text-label font-semibold text-ink-muted">{t('profile.notifyCyclesHint')}</p>
              <Row
                title={t('settings.sounds')}
                variant="toggle"
                checked={soundOn}
                onCheckedChange={(enabled) => updateSound.mutate({ soundEnabled: enabled })}
              />
              {push.isSupported ? (
                <Row
                  title={t('settings.push')}
                  variant="toggle"
                  checked={push.isSubscribed}
                  onCheckedChange={(enabled) => {
                    if (enabled) void push.subscribe();
                    else void push.unsubscribe();
                  }}
                />
              ) : null}
              <p className="border-t border-line-soft px-4 py-3 text-label font-semibold text-ink-muted">
                {t('settings.notifyMyEventsHint')}
              </p>
            </div>
          ) : null}
        </div>
        <Row
          title={t('profile.largeType')}
          variant="toggle"
          checked={prefs.fontScale >= 1.1}
          onCheckedChange={(enabled) => {
            const scale = enabled ? 1.25 : 1;
            applyFontScale(scale);
            updateFont.mutate({ fontScale: scale });
          }}
        />
        <Row title={t('settings.language')} variant="value" value={languageLabel} onClick={() => setLanguageOpen(true)} />
      </Group>

      <Group title={t('profile.more')}>
        <Row title={t('nav.help')} to="/me/help" variant="link" />
        <Row title={t('profile.about')} variant="link" onClick={() => setAboutOpen(true)} />
        <Row title={t('settings.logout')} variant="danger" onClick={() => setLogoutOpen(true)} />
      </Group>

      {isAdmin ? (
        <section>
          <div className="mb-1.5 mt-4 flex items-center gap-2 px-1">
            <h2 className="text-label font-bold text-ink-muted">{t('profile.adminsOnly')}</h2>
            <Pill tone="warm">{t('profile.adminBadge')}</Pill>
          </div>
          <Group>
            <Row title={t('profile.broadcast')} to="/me/broadcast" variant="link" />
            <Row title={t('profile.statistics')} to="/me/stats" variant="link" />
            <Row
              title={t('support.title')}
              to="/support"
              variant="link"
              trailing={supportCount > 0 ? <Pill tone="care">{String(supportCount)}</Pill> : undefined}
            />
            <AdminReviews />
          </Group>
        </section>
      ) : null}

      <LanguageSheet open={languageOpen} onClose={() => setLanguageOpen(false)} />
      <AboutSheet open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <LogoutSheet open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={signOut} email={profile.email} />
    </Screen>
  );
}
