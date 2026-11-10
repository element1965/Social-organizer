import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LARGE_AMOUNT_WARNING, MIN_COLLECTION_AMOUNT } from '@so/shared';
import { IconChevron } from '../components/ui2/icons';
import { amountIssue, formatCount, isHttpsUrl, parseWhole } from '../components/collection/text';
import { Button } from '../components/ui2/Button';
import { Input } from '../components/ui2/Input';
import { Meter } from '../components/ui2/Meter';
import { Screen } from '../components/ui2/Screen';
import { Segmented } from '../components/ui2/Segmented';
import { Textarea } from '../components/ui2/Textarea';
import { Sheet } from '../components/ui2/Sheet';
import { useShellMode } from '../components/ui2/shell-mode';
import { formatMoney } from '../components/ui2/format';
import { Card } from '../components/ui2/Card';
import { trpc } from '../lib/trpc';
import { useOffline } from '../lib/connectivity';
import { OfflineHint } from '../components/offline/OfflineNotice';
import { PathToRequestSheet } from '../components/circle/PathToRequest';
import { useNeedCounts } from '../components/profile/useNeedCounts';

const APPS = ['appTelegram', 'appWhatsApp', 'appSignal', 'appViber', 'appDiscord', 'appOther'] as const;

const DESCRIPTION_MAX = 300;

type AskType = 'EMERGENCY' | 'REGULAR';

export function AskPage() {
  const { t } = useTranslation();
  const desktop = useShellMode() === 'sidebar';

  return (
    <Screen
      width="column"
      title={desktop ? t('ask.title') : undefined}
      back={desktop ? { label: t('nav.circle'), to: '/' } : undefined}
      action={desktop ? <NeedsLink /> : undefined}
    >
      {desktop ? null : (
        <div className="flex items-center justify-between gap-3 pt-6">
          <h1 className="min-w-0 truncate text-h1 font-extrabold text-ink">{t('ask.title')}</h1>
          <NeedsLink />
        </div>
      )}
      <AskBody />
    </Screen>
  );
}

/** Compact link to the list of open and past Needs and the ones the person takes part in (/me/history). */
function NeedsLink() {
  const { t } = useTranslation();
  const counts = useNeedCounts();
  return (
    <Link
      to="/me/history"
      aria-label={t('profile.collections')}
      className="so-focus inline-flex min-h-[44px] shrink-0 items-center gap-0.5 whitespace-nowrap text-body-s font-bold text-care"
    >
      {counts ? t('ask.allLink', { count: counts.open + counts.past }) : t('ask.allLinkPlain')}
      <IconChevron className="h-[18px] w-[18px] shrink-0" />
    </Link>
  );
}

function AskBody() {
  const { t, i18n } = useTranslation();
  const offline = useOffline();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const access = trpc.collection.askAccess.useQuery();
  const mine = trpc.collection.myActive.useQuery(undefined, { enabled: access.data?.allowed === true });
  const create = trpc.collection.create.useMutation({
    onSuccess: (created) => {
      utils.collection.myActive.invalidate();
      navigate('/', { state: { collectionId: created.id } });
    },
  });

  const [type, setType] = useState<AskType>('EMERGENCY');
  const [amount, setAmount] = useState('');
  const [chat, setChat] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; chat?: string; form?: string }>({});
  const [howOpen, setHowOpen] = useState(false);
  const [largeOpen, setLargeOpen] = useState(false);
  const amountRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  if (access.isLoading) {
    return <p className="mt-6 text-body-s font-semibold text-ink-muted">{t('common.loading')}</p>;
  }
  if (access.isError || !access.data) {
    return (
      <Card className="mt-4">
        <p className="text-body-s font-semibold text-ink">{t('common.error')}</p>
        <Button className="mt-3 w-full" onClick={() => access.refetch()}>{t('common.retry')}</Button>
      </Card>
    );
  }
  if (!access.data.allowed) {
    return (
      <PathToRequestSheet open onClose={() => navigate('/')}>
        <AskPreview />
      </PathToRequestSheet>
    );
  }

  const whole = parseWhole(amount);
  const canHelp = access.data.networkCanHelp;
  const overHelp = whole != null && canHelp != null && whole > canHelp;
  const amountHint = canHelp == null
    ? undefined
    : overHelp
      ? t('ask.amountWarn', { amount: formatMoney(canHelp) })
      : t('ask.amountHint', { amount: formatMoney(canHelp) });

  const validate = () => {
    const next: { amount?: string; chat?: string } = {};
    const issue = amountIssue(amount, MIN_COLLECTION_AMOUNT);
    if (issue === 'whole') next.amount = t('ask.whole');
    else if (issue) next.amount = t('ask.minAmount');
    if (!chat.trim()) next.chat = t('ask.chatError');
    else if (!isHttpsUrl(chat)) next.chat = t('ask.chatInvalid');
    return next;
  };

  const send = () => {
    if (whole == null) return;
    setErrors({});
    create.mutate(
      { type, amount: whole, chatLink: chat.trim(), description: description.trim() || undefined, inputCurrency: 'USD' },
      {
        onError: (error) => {
          const message = error.message;
          if (message.includes('ASK_LOCKED')) setErrors({ form: t('ask.serverLocked') });
          else if (message.includes('already have an active')) setErrors({ form: t('ask.alreadyOpen') });
          else if (message.includes('https://')) setErrors({ chat: t('ask.chatInvalid') });
          else setErrors({ form: t('common.error') });
        },
      },
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = validate();
    if (next.amount || next.chat) {
      setErrors(next);
      (next.amount ? amountRef : chatRef).current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (whole != null && whole > LARGE_AMOUNT_WARNING) {
      setLargeOpen(true);
      return;
    }
    send();
  };

  const reach = access.data.networkCount === 0 && access.data.directCount === 0
    ? t('ask.reachEmpty')
    : t('ask.reach', {
        network: formatCount(access.data.networkCount, i18n.language),
        direct: formatCount(access.data.directCount, i18n.language),
      });

  return (
    <>
      <div className="mt-4 flex flex-col gap-3">
        {(mine.data ?? []).map((col) => (
          <OwnCollection key={col.id} col={col} />
        ))}
      </div>
      <form onSubmit={onSubmit} className="mt-3 rounded-xl bg-surface p-4 shadow-card" noValidate>
        <div ref={amountRef}>
          <Input
            variant="money"
            label={t('ask.amountLabel')}
            value={amount}
            onValueChange={(value) => {
              setAmount(value);
              setErrors((prev) => ({ ...prev, amount: undefined, form: undefined }));
            }}
            error={errors.amount}
            hint={errors.amount ? undefined : amountHint}
          />
        </div>
        <Segmented
          className="mt-4"
          label={t('ask.typeLabel')}
          value={type}
          onChange={setType}
          options={[
            { value: 'EMERGENCY', label: t('ask.once') },
            { value: 'REGULAR', label: t('ask.every28') },
          ]}
        />
        <p className="mt-2 text-label font-semibold text-ink-muted">
          {type === 'REGULAR' ? t('ask.every28Hint') : t('ask.onceHint')}
        </p>
        <div ref={chatRef} className="mt-4">
          <Input
            label={t('ask.chatLabel')}
            value={chat}
            placeholder={t('ask.chatPlaceholder')}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            error={errors.chat}
            onChange={(event) => {
              setChat(event.target.value);
              setErrors((prev) => ({ ...prev, chat: undefined, form: undefined }));
            }}
          />
          {errors.chat ? null : (
            <button type="button" className="so-focus mt-1.5 text-label font-bold text-care" onClick={() => setHowOpen(true)}>
              {t('ask.chatHow')}
            </button>
          )}
        </div>
        <div className="mt-4">
          <Textarea
            label={t('ask.descLabel')}
            value={description}
            placeholder={t('ask.descPlaceholder')}
            max={DESCRIPTION_MAX}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <p className="mt-4 rounded-lg bg-care-soft px-3.5 py-3 text-caption font-semibold text-ink">{reach}</p>
        {errors.form ? <p className="mt-3 text-label font-semibold text-sos">{errors.form}</p> : null}
        <Button type="submit" className="mt-4 w-full" loading={create.isPending} disabled={offline}>
          {t('ask.submit')}
        </Button>
        {offline ? <OfflineHint /> : null}
      </form>

      <Sheet
        open={largeOpen}
        onClose={() => setLargeOpen(false)}
        title={t('ask.largeTitle', { amount: formatMoney(whole ?? 0) })}
        footer={
          <>
            <Button variant="secondary" className="w-full" onClick={() => setLargeOpen(false)}>{t('ask.largeNo')}</Button>
            <Button className="w-full" loading={create.isPending} onClick={() => { setLargeOpen(false); send(); }}>{t('ask.largeYes')}</Button>
          </>
        }
      />

      <Sheet open={howOpen} onClose={() => setHowOpen(false)} title={t('ask.chatSheetTitle')} description={t('ask.chatSheetLead')}>
        <ol className="list-none p-0">
          {(['chatStep1', 'chatStep2', 'chatStep3'] as const).map((key, index) => (
            <li key={key} className="flex items-start gap-3 py-2 text-body-s font-semibold">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-ink text-micro font-extrabold text-canvas">{index + 1}</span>
              <span>{t(`ask.${key}`)}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {APPS.map((key) => (
            <span key={key} className="grid h-[30px] place-items-center rounded-sm bg-canvas px-2.5 text-micro font-bold text-ink-muted">
              {t(`ask.${key}`)}
            </span>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={() => setHowOpen(false)}>{t('ask.chatGotIt')}</Button>
      </Sheet>
    </>
  );
}

function OwnCollection({ col }: { col: { id: string; amount: number | null; currentAmount: number; participantCount?: number; _count?: { obligations: number }; status: string; blockReason: string | null } }) {
  const { t } = useTranslation();
  const goal = col.amount ?? 0;
  const ratio = goal > 0 ? Math.min(1, col.currentAmount / goal) : 0;
  const title = goal > 0
    ? t('ask.ownTitle', { current: formatMoney(col.currentAmount), goal: formatMoney(goal) })
    : t('ask.ownNoGoal');
  const people = col.participantCount ?? col._count?.obligations ?? 0;
  const meta = col.blockReason
    ? t('collection.suspended')
    : t('collection.participantsCount', { count: people });

  return (
    <Link to={`/collection/${col.id}`} className="so-focus flex items-center gap-3 rounded-xl bg-surface p-3 shadow-card">
      <Ring ratio={goal > 0 ? ratio : null} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-s font-extrabold tracking-tight">{title}</span>
        <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{meta}</span>
      </span>
      <IconChevron className="h-[18px] w-[18px] shrink-0 text-ink-subtle" />
    </Link>
  );
}

function Ring({ ratio }: { ratio: number | null }) {
  const radius = 18;
  const length = 2 * Math.PI * radius;
  const offset = ratio == null ? length : length * (1 - ratio);
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center text-micro font-extrabold text-ink">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={radius} fill="none" strokeWidth="4" className="stroke-line" />
        {ratio == null ? null : (
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className="stroke-care"
            strokeDasharray={length}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      {ratio == null ? '—' : `${Math.round(ratio * 100)}%`}
    </span>
  );
}

/** What a collection looks like in the circle: shown under the path while asking is locked. */
function AskPreview() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" className="so-focus text-left text-label font-bold text-care" onClick={() => setOpen((value) => !value)}>
        {open ? t('ask.previewHide') : t('ask.preview')}
      </button>
      {open ? (
        <div className="mt-2 rounded-lg bg-canvas p-3">
          <p className="text-label font-semibold text-ink-muted">{t('ask.previewCaption')}</p>
          <p className="mt-1 text-h3 font-extrabold tabular-nums">{formatMoney(80)}</p>
          <Meter mine={0} others={40} goal={80} showMine={false} />
        </div>
      ) : null}
    </div>
  );
}
