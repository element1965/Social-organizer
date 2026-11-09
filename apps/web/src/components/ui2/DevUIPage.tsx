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

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="mb-3 text-label font-bold uppercase tracking-wide text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

function ShowBanner() {
  const { t } = useTranslation();
  const { show } = useBanner();
  return (
    <Button
      variant="secondary"
      size="md"
      onClick={() =>
        show({
          kicker: t('common.gallery.bannerKicker'),
          title: t('common.gallery.sampleName'),
          body: t('common.gallery.sampleVia'),
        })
      }
    >
      {t('common.gallery.showBanner')}
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
  const g = 'common.gallery';
  const sampleUser = {
    name: t(`${g}.sampleName`),
    email: t(`${g}.lockedValue`),
    photoUrl: null,
  };
  const askPartial = { circle: 0.4, network: 0.7 };
  const declineFooter = (close: () => void, stayVariant: 'ghost' | 'secondary') => (
    <>
      <Button variant="danger" size="md" className="w-full">
        {t(`${g}.decline`)}
      </Button>
      <Button variant={stayVariant} size="md" className="w-full" onClick={close}>
        {t(`${g}.stay`)}
      </Button>
    </>
  );

  return (
    <div className="px-4 pb-16">
      <Block title="Button">
        <div className="flex flex-col items-start gap-3">
          <Button>{t('common.confirm')}</Button>
          <Button variant="secondary">{t(`${g}.acquainted`)}</Button>
          <Button variant="ghost">{t('common.done')}</Button>
          <Button variant="danger">{t(`${g}.decline`)}</Button>
          <Button variant="text">{t(`${g}.later`)}</Button>
          <Button variant="textDanger">{t(`${g}.deleteAccount`)}</Button>
          <Button variant="icon" aria-label={t(`${g}.searchLabel`)} icon={<IconSearch />} />
          <Button pressed>{t(`${g}.pressed`)}</Button>
          <Button disabled>{t(`${g}.disabled`)}</Button>
          <Button loading>{t('common.loading')}</Button>
          <Button className="outline outline-2 outline-offset-2 outline-care">{t(`${g}.focusSample`)}</Button>
        </div>
      </Block>

      <Block title="Input">
        <div className="flex max-w-md flex-col gap-4">
          <Input label={t(`${g}.placeholder`)} placeholder={t(`${g}.placeholder`)} />
          <Input label={t(`${g}.focused`)} defaultValue={t(`${g}.sampleName`)} className="border-care" />
          <Input label={t(`${g}.filled`)} defaultValue={t(`${g}.sampleName`)} />
          <Input label={t('common.search')} variant="search" placeholder={t(`${g}.searchLabel`)} />
          <Input label={t(`${g}.placeholder`)} error={t(`${g}.errorReason`)} defaultValue="" />
          <Input variant="money" label={t(`${g}.moneyLabel`)} value={money} onValueChange={setMoney} hint={t(`${g}.moneyHint`)} />
          <Input variant="money" label={t(`${g}.moneyLabel`)} value="9000" error={t(`${g}.moneyError`)} />
          <Input variant="code" label={t(`${g}.codeLabel`)} value={code} onValueChange={setCode} />
          <Input variant="locked" label={t(`${g}.lockedLabel`)} value={t(`${g}.lockedValue`)} readOnly />
        </div>
      </Block>

      <Block title="Segmented">
        <Segmented
          label={t('nav.ask')}
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'once', label: t(`${g}.once`) },
            { value: 'every', label: t(`${g}.every`) },
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

      <Block title="Switch">
        <Switch checked={on} onCheckedChange={setOn} label={t(`${g}.largeType`)} />
      </Block>

      <Block title="Chip">
        <div className="flex flex-wrap gap-2">
          <Chip variant="ring" dot="ink" count="9" active>
            {t(`${g}.ring1`)}
          </Chip>
          <Chip variant="ring" dot="node-2" count="5">
            {t(`${g}.ring2`)}
          </Chip>
          <Chip variant="preset">15 $</Chip>
          <Chip variant="preset" active>
            30 $
          </Chip>
          <Chip variant="onscene">{t(`${g}.backToSelf`)}</Chip>
          <Chip variant="action">{t(`${g}.backToSelf`)}</Chip>
          <Chip variant="action" active>
            {t(`${g}.backToSelf`)}
          </Chip>
        </div>
      </Block>

      <Block title="Pill">
        <div className="flex flex-wrap gap-2">
          <Pill>{t(`${g}.none`)}</Pill>
          <Pill tone="care">{t(`${g}.participating`)}</Pill>
          <Pill tone="warm">{t(`${g}.newCycle`)}</Pill>
          <Pill tone="sos">{t(`${g}.paused`)}</Pill>
          <Pill tone="link">{t(`${g}.yourCollection`)}</Pill>
        </div>
      </Block>

      <Block title="Avatar">
        <div className="flex flex-wrap items-end gap-3">
          <Avatar name={t(`${g}.sampleName`)} size={36} />
          <Avatar name={t(`${g}.sampleName`)} size={40} online />
          <Avatar name={t(`${g}.samplePerson`)} size={48} />
          <Avatar name={t(`${g}.nameOleg`)} size={64} />
          <Avatar name={t('common.you')} size={88} />
        </div>
      </Block>

      <Block title="Card">
        <Card title={t(`${g}.sampleName`)} subtitle={t(`${g}.sampleVia`)}>
          <div className="rounded-r-lg bg-surface-2 p-3 text-body font-body">{t(`${g}.participating`)}</div>
        </Card>
      </Block>

      <Block title="Group">
        <Group title={t('nav.account')}>
          <Row variant="link" title={t('nav.account')} subtitle={t(`${g}.lockedValue`)} icon={<IconBell className="h-5 w-5" />} />
          <Row variant="value" title={t('nav.stake')} value={formatMoney(15)} />
          <Row variant="toggle" title={t(`${g}.largeType`)} checked={on} onCheckedChange={setOn} />
          <Row variant="danger" title={t(`${g}.remove`)} />
        </Group>
      </Block>

      <Block title="EventRow">
        <div className="flex flex-col gap-2">
          <EventRow
            hot
            icon={<IconBell className="h-5 w-5" />}
            title={t(`${g}.sampleName`)}
            subtitle={t(`${g}.sampleVia`)}
            amount={formatMoney(15)}
          />
          <EventRow
            icon={<IconBell className="h-5 w-5" />}
            title={t(`${g}.samplePerson`)}
            subtitle={t(`${g}.sampleJoined`)}
            onDismiss={() => undefined}
          />
        </div>
      </Block>

      <Block title="PersonRow">
        <PersonRow name={t(`${g}.samplePerson`)} subtitle={t(`${g}.brought`)} value="3" online />
      </Block>

      <Block title="Meter">
        <Meter mine={15} others={100} goal={300} />
        <div className="mt-4">
          <Meter mine={0} others={80} goal={300} showMine={false} />
        </div>
      </Block>

      <Block title="StageRail">
        <StageRail steps={[t(`${g}.stageAmount`), t(`${g}.stageTalk`), t(`${g}.stageClosed`)]} done={2} />
      </Block>

      <Block title="PathFigure">
        <PathFigure names={[t('common.you'), t(`${g}.sampleName`)]} />
        <div className="mt-4">
          <PathFigure names={[t('common.you'), t(`${g}.nameBrother`), t(`${g}.sampleName`)]} />
        </div>
        <div className="mt-4">
          <PathFigure
            names={[t('common.you'), t(`${g}.nameOleg`), t(`${g}.nameBrother`), t(`${g}.sampleName`)]}
          />
        </div>
      </Block>

      <Block title="AskMark">
        <div className="flex items-center gap-4">
          <AskMark progress={{ circle: 1, network: 1 }} />
          <AskMark progress={askPartial} />
        </div>
      </Block>

      <Block title="Banner">
        <Banner
          inline
          duration={0}
          kicker={t(`${g}.bannerKicker`)}
          title={t(`${g}.sampleName`)}
          body={t(`${g}.sampleVia`)}
          icon={<IconBell className="h-5 w-5" />}
        />
        <div className="mt-3">
          <ShowBanner />
        </div>
      </Block>

      <Block title="Sheet">
        <div className="relative h-[440px] overflow-hidden rounded-r-xl border border-line">
          <Sheet
            open={sheetOpen}
            contained
            presentation="sheet"
            onClose={() => setSheetOpen(false)}
            title={t(`${g}.declineTitle`)}
            description={t(`${g}.declineBody`)}
            footer={declineFooter(() => setSheetOpen(false), 'ghost')}
          />
        </div>
        <div className="relative mt-4 h-[360px] overflow-hidden rounded-r-xl border border-line">
          <Sheet
            open={dialogOpen}
            contained
            presentation="dialog"
            onClose={() => setDialogOpen(false)}
            title={t(`${g}.declineTitle`)}
            description={t(`${g}.declineBody`)}
            footer={declineFooter(() => setDialogOpen(false), 'secondary')}
          />
        </div>
      </Block>

      <Block title="Screen">
        <div className="overflow-hidden rounded-r-xl border border-line">
          <Screen
            shell="tabs"
            title={t('nav.person')}
            back={{ label: t('nav.people'), to: '/dev/ui' }}
            action={<span className="text-body-s font-bold text-sos">{t(`${g}.remove`)}</span>}
          >
            <p className="text-body font-body">{t('common.comingSoon')}</p>
          </Screen>
        </div>
        <div className="mt-4 overflow-hidden rounded-r-xl border border-line">
          <Screen
            shell="sidebar"
            width="column"
            title={t('nav.collection')}
            back={{ label: t('nav.circle'), to: '/dev/ui' }}
            action={<Button variant="icon" size="md" aria-label={t(`${g}.searchLabel`)} icon={<IconSearch />} />}
          >
            <p className="text-body font-body">{t('common.comingSoon')}</p>
          </Screen>
        </div>
      </Block>

      <Block title={t(`${g}.shell`)}>
        <p className="mb-2 text-label font-semibold text-ink-muted">{t(`${g}.tabs`)}</p>
        <div className="relative h-[520px] max-w-[390px] overflow-hidden rounded-r-xl border border-line bg-canvas">
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
        <p className="mb-2 mt-4 text-label font-semibold text-ink-muted">{t(`${g}.rail`)}</p>
        <div className="flex h-[520px] max-w-[640px] overflow-hidden rounded-r-xl border border-line bg-canvas">
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
        <p className="mb-2 mt-4 text-label font-semibold text-ink-muted">{t(`${g}.sidebar`)}</p>
        <div className="flex h-[560px] overflow-hidden rounded-r-xl border border-line bg-canvas">
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

      <Block title="Scene">
        <SceneBox>
          <Chip variant="onscene" count="9">
            {t(`${g}.ring1`)}
          </Chip>
          <SceneHint>{t(`${g}.sceneHint`)}</SceneHint>
          <SceneAccent>{t(`${g}.weekDelta`)}</SceneAccent>
        </SceneBox>
      </Block>

      <Block title="Site">
        <div className="overflow-hidden rounded-r-xl border border-line">
          <SiteHeader
            brand={t('common.appName')}
            links={[
              { label: t('nav.how'), href: '/how', active: true },
              { label: t('nav.help'), href: '/me/help' },
            ]}
            language="EN"
            themeLabel={t('nav.theme')}
            onTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            loginLabel={t('auth.login')}
          />
          <div className="px-4 pb-6">
            <Stat value="1 240" label={t('nav.people')} delta={t(`${g}.weekDelta`)} />
            <div className="mt-4 flex flex-wrap gap-2">
              <StoreButton>{t('common.appName')}</StoreButton>
              <StoreButton tone="light">{t(`${g}.later`)}</StoreButton>
            </div>
          </div>
          <SiteFooter
            brand={t('common.appName')}
            note={t(`${g}.lead`)}
            links={[{ label: t('nav.how'), href: '/how' }]}
          />
        </div>
        <div className="mt-4">
          <Panel title={t('auth.login')} subtitle={t(`${g}.lead`)}>
            <Button className="w-full">{t('auth.login')}</Button>
          </Panel>
        </div>
        <div className="mt-4">
          <Panel variant="pubcard" title={t(`${g}.sampleName`)} subtitle={t(`${g}.sampleVia`)}>
            <Avatar name={t(`${g}.sampleName`)} size={88} />
            <div className="mt-3">
              <Button className="w-full">{t('common.confirm')}</Button>
            </div>
          </Panel>
        </div>
        <div className="mt-6">
          <Prose title={t('nav.how')} updated={t(`${g}.lead`)}>
            <h2 className="text-title font-extrabold">{t('nav.help')}</h2>
            <p>{t('common.comingSoon')}</p>
          </Prose>
        </div>
      </Block>
    </div>
  );
}

function ThemeFrame({ tone }: { tone: 'light' | 'dark' }) {
  const { t } = useTranslation();
  return (
    <section className={`${tone} bg-canvas text-ink`}>
      <h2 className="px-4 pt-8 text-h3 font-extrabold">{t(tone === 'light' ? 'common.gallery.light' : 'common.gallery.dark')}</h2>
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
          <h1 className="text-h1 font-extrabold">{t('common.gallery.title')}</h1>
          <p className="mt-2 max-w-[680px] text-body font-body text-ink-muted">{t('common.gallery.lead')}</p>
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
              {t('common.gallery.openSheet')}
            </Button>
          </div>
        </header>
        <ThemeFrame tone="light" />
        <ThemeFrame tone="dark" />
        <Sheet
          open={liveSheet}
          onClose={() => setLiveSheet(false)}
          title={t('common.gallery.declineTitle')}
          description={t('common.gallery.declineBody')}
          footer={
            <>
              <Button variant="danger" size="md" className="w-full" onClick={() => setLiveSheet(false)}>
                {t('common.gallery.decline')}
              </Button>
              <Button variant="ghost" size="md" className="w-full" onClick={() => setLiveSheet(false)}>
                {t('common.gallery.stay')}
              </Button>
            </>
          }
        />
      </div>
    </BannerProvider>
  );
}
