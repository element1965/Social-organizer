import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { AskMark } from './AskMark';
import { ShellChrome, type ThemeChoice } from './AppShell';
import { Avatar } from './Avatar';
import { Banner, BannerProvider, useBanner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { EventRow } from './EventRow';
import { formatMoney } from './format';
import { Group, Row } from './Group';
import { IconBell, IconSearch } from './icons';
import { Input } from './Input';
import { Meter } from './Meter';
import { PathFigure } from './PathFigure';
import { PersonRow } from './PersonRow';
import { Pill } from './Pill';
import { SceneAccent, SceneBox, SceneHint } from './Scene';
import { Screen } from './Screen';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import { Panel, Prose, SiteFooter, SiteHeader, Stat, StoreButton } from './Site';
import { StageRail } from './StageRail';
import { Switch } from './Switch';

const galleryCopy = {
  title: "Components",
  lead: "Every component from the design system, in both themes.",
  pressed: "Pressed",
  disabled: "Disabled",
  acquainted: "We know each other",
  remove: "Remove",
  deleteAccount: "Delete account",
  placeholder: "Placeholder",
  focused: "In focus",
  filled: "Filled in",
  errorReason: "A chat is required: people who report Participation gather there.",
  moneyLabel: "How much is needed",
  moneyHint: "Declared participation of the network is up to $3,720 now.",
  moneyError: "Declared participation of the network is up to $3,720 now.",
  once: "Emergency",
  every: "Regular",
  ring1: "1st",
  ring2: "2nd",
  largeType: "Larger text",
  sampleName: "Maria Koval",
  sampleVia: "Need, via Oleg",
  sampleJoined: "Joined with your link",
  samplePerson: "Katya Belova",
  participating: "You are in",
  yourCollection: "Your Need",
  newCycle: "New cycle",
  paused: "Paused",
  none: "None",
  declineTitle: "Withdraw your Participation?",
  declineBody: "Your $15 will no longer be reported. You can come back while the Need is open.",
  decline: "Withdraw",
  stay: "Stay",
  sceneHint: "One finger rotates, two fingers zoom.",
  weekDelta: "+40 $ this week",
  backToSelf: "Back to me",
  showBanner: "Show banner",
  openSheet: "Open sheet",
  nameOleg: "Oleg",
  nameBrother: "Oleg brother",
  codeLabel: "Code from the letter",
  lockedLabel: "Email",
  lockedValue: "anna@example.com",
  focusSample: "Button in focus",
  brought: "brought 3",
  shell: "Shell",
  tabs: "Tab bar",
  rail: "Rail",
  sidebar: "Sidebar",
  lightTheme: "Light theme",
  darkTheme: "Dark theme",
  bannerKicker: "Circle",
  searchLabel: "Search people",
  later: "Later",
  sampleChip: "15 $",
  sampleChipActive: "30 $",
  sampleStat: "1 240",
  sampleCount: "3",
  langSample: "EN",
  blockButton: "Button",
  blockInput: "Input",
  blockSegmented: "Segmented",
  blockSwitch: "Switch",
  blockChip: "Chip",
  blockPill: "Pill",
  blockAvatar: "Avatar",
  blockCard: "Card",
  blockGroup: "Group",
  blockEventRow: "EventRow",
  blockPersonRow: "PersonRow",
  blockMeter: "Meter",
  blockStageRail: "StageRail",
  blockPathFigure: "PathFigure",
  blockAskMark: "AskMark",
  blockBanner: "Banner",
  blockSheet: "Sheet",
  blockScreen: "Screen",
  blockScene: "Scene",
  blockSite: "Site"
} as const;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-label font-bold uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function ShowBanner() {
  const { show } = useBanner();
  return (
    <Button
      variant="secondary"
      size="md"
      onClick={() =>
        show({
          kicker: galleryCopy.bannerKicker,
          title: galleryCopy.sampleName,
          body: galleryCopy.sampleVia,
        })
      }
    >
      {galleryCopy.showBanner}
    </Button>
  );
}

function Gallery() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState('once');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [on, setOn] = useState(true);
  const [code, setCode] = useState('123456');
  const [money, setMoney] = useState('1240');
  const [sheetOpen, setSheetOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(true);
  const sampleUser = {
    name: galleryCopy.sampleName,
    email: galleryCopy.lockedValue,
    photoUrl: null,
  };
  const askPartial = { circle: 0.4, network: 0.7 };
  const declineFooter = (close: () => void, stayVariant: 'ghost' | 'secondary') => (
    <>
      <Button variant="danger" size="md" className="w-full">
        {galleryCopy.decline}
      </Button>
      <Button variant={stayVariant} size="md" className="w-full" onClick={close}>
        {galleryCopy.stay}
      </Button>
    </>
  );

  return (
    <div className="px-4 pb-16">
      <Block title={galleryCopy.blockButton}>
        <div className="flex flex-col items-start gap-3">
          <Button>{t('common.confirm')}</Button>
          <Button variant="secondary">{galleryCopy.acquainted}</Button>
          <Button variant="ghost">{t('common.done')}</Button>
          <Button variant="danger">{galleryCopy.decline}</Button>
          <Button variant="text">{galleryCopy.later}</Button>
          <Button variant="textDanger">{galleryCopy.deleteAccount}</Button>
          <Button variant="icon" aria-label={galleryCopy.searchLabel} icon={<IconSearch />} />
          <Button pressed>{galleryCopy.pressed}</Button>
          <Button disabled>{galleryCopy.disabled}</Button>
          <Button loading>{t('common.loading')}</Button>
          <Button className="outline outline-2 outline-offset-2 outline-care">{galleryCopy.focusSample}</Button>
        </div>
      </Block>

      <Block title={galleryCopy.blockInput}>
        <div className="flex max-w-md flex-col gap-4">
          <Input label={galleryCopy.placeholder} placeholder={galleryCopy.placeholder} />
          <Input label={galleryCopy.focused} defaultValue={galleryCopy.sampleName} className="border-care" />
          <Input label={galleryCopy.filled} defaultValue={galleryCopy.sampleName} />
          <Input label={t('common.search')} variant="search" placeholder={galleryCopy.searchLabel} />
          <Input label={galleryCopy.placeholder} error={galleryCopy.errorReason} defaultValue="" />
          <Input variant="money" label={galleryCopy.moneyLabel} value={money} onValueChange={setMoney} hint={galleryCopy.moneyHint} />
          <Input variant="money" label={galleryCopy.moneyLabel} value="9000" error={galleryCopy.moneyError} />
          <Input variant="code" label={galleryCopy.codeLabel} value={code} onValueChange={setCode} />
          <Input variant="locked" label={galleryCopy.lockedLabel} value={galleryCopy.lockedValue} readOnly />
        </div>
      </Block>

      <Block title={galleryCopy.blockSegmented}>
        <Segmented
          label={t('nav.ask')}
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'once', label: galleryCopy.once },
            { value: 'every', label: galleryCopy.every },
          ]}
        />
        <div className="mt-3">
          <Segmented
            variant="inline"
            label={t('nav.theme')}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: t('common.themeAuto') },
              { value: 'light', label: t('common.themeLight') },
              { value: 'dark', label: t('common.themeDark') },
            ]}
          />
        </div>
      </Block>

      <Block title={galleryCopy.blockSwitch}>
        <Switch checked={on} onCheckedChange={setOn} label={galleryCopy.largeType} />
      </Block>

      <Block title={galleryCopy.blockChip}>
        <div className="flex flex-wrap gap-2">
          <Chip variant="ring" dot="ink" count="9" active>
            {galleryCopy.ring1}
          </Chip>
          <Chip variant="ring" dot="node-2" count="5">
            {galleryCopy.ring2}
          </Chip>
          <Chip variant="preset">{galleryCopy.sampleChip}</Chip>
          <Chip variant="preset" active>
            {galleryCopy.sampleChipActive}
          </Chip>
          <Chip variant="onscene">{galleryCopy.backToSelf}</Chip>
          <Chip variant="action">{galleryCopy.backToSelf}</Chip>
          <Chip variant="action" active>
            {galleryCopy.backToSelf}
          </Chip>
        </div>
      </Block>

      <Block title={galleryCopy.blockPill}>
        <div className="flex flex-wrap gap-2">
          <Pill>{galleryCopy.none}</Pill>
          <Pill tone="care">{galleryCopy.participating}</Pill>
          <Pill tone="warm">{galleryCopy.newCycle}</Pill>
          <Pill tone="sos">{galleryCopy.paused}</Pill>
          <Pill tone="link">{galleryCopy.yourCollection}</Pill>
        </div>
      </Block>

      <Block title={galleryCopy.blockAvatar}>
        <div className="flex flex-wrap items-end gap-3">
          <Avatar name={galleryCopy.sampleName} size={36} />
          <Avatar name={galleryCopy.sampleName} size={40} online />
          <Avatar name={galleryCopy.samplePerson} size={48} />
          <Avatar name={galleryCopy.nameOleg} size={64} />
          <Avatar name={t('common.you')} size={88} />
        </div>
      </Block>

      <Block title={galleryCopy.blockCard}>
        <Card title={galleryCopy.sampleName} subtitle={galleryCopy.sampleVia}>
          <div className="rounded-lg bg-surface-2 p-3 text-body font-body">{galleryCopy.participating}</div>
        </Card>
      </Block>

      <Block title={galleryCopy.blockGroup}>
        <Group title={t('nav.account')}>
          <Row variant="link" title={t('nav.account')} subtitle={galleryCopy.lockedValue} icon={<IconBell className="h-5 w-5" />} />
          <Row variant="value" title={t('nav.stake')} value={formatMoney(15)} />
          <Row variant="toggle" title={galleryCopy.largeType} checked={on} onCheckedChange={setOn} />
          <Row variant="danger" title={galleryCopy.remove} />
        </Group>
      </Block>

      <Block title={galleryCopy.blockEventRow}>
        <div className="flex flex-col gap-2">
          <EventRow
            hot
            icon={<IconBell className="h-5 w-5" />}
            title={galleryCopy.sampleName}
            subtitle={galleryCopy.sampleVia}
            amount={formatMoney(15)}
          />
          <EventRow
            icon={<IconBell className="h-5 w-5" />}
            title={galleryCopy.samplePerson}
            subtitle={galleryCopy.sampleJoined}
            onDismiss={() => undefined}
          />
        </div>
      </Block>

      <Block title={galleryCopy.blockPersonRow}>
        <PersonRow name={galleryCopy.samplePerson} subtitle={galleryCopy.brought} value={galleryCopy.sampleCount} online />
      </Block>

      <Block title={galleryCopy.blockMeter}>
        <Meter mine={15} others={100} goal={300} />
        <div className="mt-4">
          <Meter mine={0} others={80} goal={300} showMine={false} />
        </div>
      </Block>

      <Block title={galleryCopy.blockStageRail}>
        <StageRail steps={[t('collection.stageAmount'), t('collection.stageChat'), t('collection.stageClosed')]} done={2} />
      </Block>

      <Block title={galleryCopy.blockPathFigure}>
        <PathFigure names={[t('common.you'), galleryCopy.sampleName]} />
        <div className="mt-4">
          <PathFigure names={[t('common.you'), galleryCopy.nameBrother, galleryCopy.sampleName]} />
        </div>
        <div className="mt-4">
          <PathFigure
            names={[t('common.you'), galleryCopy.nameOleg, galleryCopy.nameBrother, galleryCopy.sampleName]}
          />
        </div>
      </Block>

      <Block title={galleryCopy.blockAskMark}>
        <div className="flex items-center gap-4">
          <AskMark progress={{ circle: 1, network: 1 }} />
          <AskMark progress={askPartial} />
        </div>
      </Block>

      <Block title={galleryCopy.blockBanner}>
        <Banner
          inline
          duration={0}
          kicker={galleryCopy.bannerKicker}
          title={galleryCopy.sampleName}
          body={galleryCopy.sampleVia}
          icon={<IconBell className="h-5 w-5" />}
        />
        <div className="mt-3">
          <ShowBanner />
        </div>
      </Block>

      <Block title={galleryCopy.blockSheet}>
        <div className="relative h-[440px] overflow-hidden rounded-xl border border-line">
          <Sheet
            open={sheetOpen}
            contained
            presentation="sheet"
            onClose={() => setSheetOpen(false)}
            title={galleryCopy.declineTitle}
            description={galleryCopy.declineBody}
            footer={declineFooter(() => setSheetOpen(false), 'ghost')}
          />
        </div>
        <div className="relative mt-4 h-[360px] overflow-hidden rounded-xl border border-line">
          <Sheet
            open={dialogOpen}
            contained
            presentation="dialog"
            onClose={() => setDialogOpen(false)}
            title={galleryCopy.declineTitle}
            description={galleryCopy.declineBody}
            footer={declineFooter(() => setDialogOpen(false), 'secondary')}
          />
        </div>
      </Block>

      <Block title={galleryCopy.blockScreen}>
        <div className="overflow-hidden rounded-xl border border-line">
          <Screen
            shell="tabs"
            title={t('nav.person')}
            back={{ label: t('nav.people'), to: '/dev/ui' }}
            action={<span className="text-body-s font-bold text-sos">{galleryCopy.remove}</span>}
          >
            <p className="text-body font-body">{t('common.comingSoon')}</p>
          </Screen>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-line">
          <Screen
            shell="sidebar"
            width="column"
            title={t('nav.collection')}
            back={{ label: t('nav.circle'), to: '/dev/ui' }}
            action={<Button variant="icon" size="md" aria-label={galleryCopy.searchLabel} icon={<IconSearch />} />}
          >
            <p className="text-body font-body">{t('common.comingSoon')}</p>
          </Screen>
        </div>
      </Block>

      <Block title={galleryCopy.shell}>
        <p className="mb-2 text-label font-semibold text-ink-muted">{galleryCopy.tabs}</p>
        <div className="relative h-[520px] max-w-[390px] overflow-hidden rounded-xl border border-line bg-canvas">
          <div className="p-4">
            <h4 className="text-h1 font-extrabold">{t('nav.circle')}</h4>
          </div>
          <ShellChrome
            contained
            interactive={false}
            mode="tabs"
            section="circle"
            ask={askPartial}
            user={sampleUser}
            theme={theme}
            onTheme={setTheme}
          />
        </div>
        <p className="mb-2 mt-4 text-label font-semibold text-ink-muted">{galleryCopy.rail}</p>
        <div className="flex h-[520px] max-w-[640px] overflow-hidden rounded-xl border border-line bg-canvas">
          <ShellChrome
            contained
            interactive={false}
            mode="rail"
            section="circle"
            ask={askPartial}
            unread={4}
            user={sampleUser}
            theme={theme}
            onTheme={setTheme}
          />
          <div className="min-w-0 flex-1 p-4">
            <h4 className="text-h3 font-extrabold">{t('nav.circle')}</h4>
          </div>
        </div>
        <p className="mb-2 mt-4 text-label font-semibold text-ink-muted">{galleryCopy.sidebar}</p>
        <div className="flex h-[560px] overflow-hidden rounded-xl border border-line bg-canvas">
          <ShellChrome
            contained
            interactive={false}
            mode="sidebar"
            section="circle"
            ask={askPartial}
            unread={12}
            user={sampleUser}
            theme={theme}
            onTheme={setTheme}
          />
          <div className="min-w-0 flex-1 p-4">
            <h4 className="text-h3 font-extrabold">{t('nav.circle')}</h4>
            <p className="mt-2 max-w-[680px] text-body font-body text-ink-muted">{t('common.comingSoon')}</p>
          </div>
        </div>
      </Block>

      <Block title={galleryCopy.blockScene}>
        <SceneBox>
          <Chip variant="onscene" count="9">
            {galleryCopy.ring1}
          </Chip>
          <SceneHint>{galleryCopy.sceneHint}</SceneHint>
          <SceneAccent>{galleryCopy.weekDelta}</SceneAccent>
        </SceneBox>
      </Block>

      <Block title={galleryCopy.blockSite}>
        <div className="overflow-hidden rounded-xl border border-line">
          <SiteHeader
            brand={t('common.appName')}
            links={[
              { label: t('nav.how'), href: '/how', active: true },
              { label: t('nav.help'), href: '/me/help' },
            ]}
            language={galleryCopy.langSample}
            themeLabel={t('nav.theme')}
            onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            loginLabel={t('auth.login')}
          />
          <div className="px-4 pb-6">
            <Stat value={galleryCopy.sampleStat} label={t('nav.people')} delta={galleryCopy.weekDelta} />
            <div className="mt-4 flex flex-wrap gap-2">
              <StoreButton>{t('common.appName')}</StoreButton>
              <StoreButton tone="light">{galleryCopy.later}</StoreButton>
            </div>
          </div>
          <SiteFooter
            brand={t('common.appName')}
            note={galleryCopy.lead}
            links={[{ label: t('nav.how'), href: '/how' }]}
          />
        </div>
        <div className="mt-4">
          <Panel title={t('auth.login')} subtitle={galleryCopy.lead}>
            <Button className="w-full">{t('auth.login')}</Button>
          </Panel>
        </div>
        <div className="mt-4">
          <Panel variant="pubcard" title={galleryCopy.sampleName} subtitle={galleryCopy.sampleVia}>
            <Avatar name={galleryCopy.sampleName} size={88} />
            <div className="mt-3">
              <Button className="w-full">{t('common.confirm')}</Button>
            </div>
          </Panel>
        </div>
        <div className="mt-6">
          <Prose title={t('nav.how')} updated={galleryCopy.lead}>
            <h2 className="text-title font-extrabold">{t('nav.help')}</h2>
            <p>{t('common.comingSoon')}</p>
          </Prose>
        </div>
      </Block>
    </div>
  );
}

function ThemeFrame({ tone }: { tone: 'light' | 'dark' }) {
  return (
    <section className={`${tone} bg-canvas text-ink`}>
      <h2 className="px-4 pt-8 text-h3 font-extrabold">{galleryCopy[`${tone}Theme`]}</h2>
      <Gallery />
    </section>
  );
}

/** Dev-only catalogue. Production builds drop the route that loads this page. */
export function DevUIPage() {
  const { t } = useTranslation();
  const mode = useTheme((state) => state.mode);
  const setMode = useTheme((state) => state.setMode);
  const [liveSheet, setLiveSheet] = useState(false);

  return (
    <BannerProvider>
      <div className="min-h-[calc(100dvh-var(--sa-top))] bg-canvas text-ink">
        <header className="border-b border-line-soft px-4 py-5">
          <h1 className="text-h1 font-extrabold">{galleryCopy.title}</h1>
          <p className="mt-2 max-w-[680px] text-body font-body text-ink-muted">{galleryCopy.lead}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Segmented
              variant="inline"
              label={t('nav.theme')}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'system', label: t('common.themeAuto') },
                { value: 'light', label: t('common.themeLight') },
                { value: 'dark', label: t('common.themeDark') },
              ]}
            />
            <Button variant="secondary" size="md" onClick={() => setLiveSheet(true)}>
              {galleryCopy.openSheet}
            </Button>
          </div>
        </header>
        <ThemeFrame tone="light" />
        <ThemeFrame tone="dark" />
        <Sheet
          open={liveSheet}
          onClose={() => setLiveSheet(false)}
          title={galleryCopy.declineTitle}
          description={galleryCopy.declineBody}
          footer={
            <>
              <Button variant="danger" size="md" className="w-full" onClick={() => setLiveSheet(false)}>
                {galleryCopy.decline}
              </Button>
              <Button variant="ghost" size="md" className="w-full" onClick={() => setLiveSheet(false)}>
                {galleryCopy.stay}
              </Button>
            </>
          }
        />
      </div>
    </BannerProvider>
  );
}
