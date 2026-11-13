import { useRef, useState, type TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildContactUrl, isSafeContactUrl } from '@so/shared';
import { refreshNetwork } from '../../lib/refreshNetwork';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { PathFigure } from '../ui2/PathFigure';
import { Pill } from '../ui2/Pill';
import { Sheet } from '../ui2/Sheet';
import { formatMoney } from '../ui2/format';
import { IconBack, IconChevron } from '../ui2/icons';
import { IconClose } from './icons';

export type CardPerson = {
  id: string;
  name: string;
  accountName: string;
  photoUrl: string | null;
  depth: number;
  /** Names between me and the person. */
  via: string[];
  /** Active request of this person, if the feed knows one. */
  collection?: { id: string; amount: number | null } | null;
};

type Props = {
  person: CardPerson;
  /** floating: the phone card over the scene. column: the desktop right column with "‹ Feed". */
  variant: 'floating' | 'column';
  onClose: () => void;
  /**
   * Step through the people of the same handshake without closing the card: arrows, or a sideways swipe
   * on the card. The graph flies to each one (the screen changes the focused person).
   */
  step?: { index: number; total: number; onPrev: () => void; onNext: () => void };
};

/** Person tapped on the graph: name, ring, path; actions Collection / Open / Contacts. */
export function PersonCard({ person, variant, onClose, step }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const direct = person.depth === 1;
  // Same as the person page: ask for anyone, the server decides what this viewer may see (hideContacts,
  // direct connection, a Need that reached them). Gating by the 1st ring hid contacts the profile shows.
  const contacts = trpc.user.getContacts.useQuery({ userId: person.id });
  const filled = (contacts.data ?? []).filter((c) => c.value);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const revoke = trpc.connection.revoke.useMutation({
    onSuccess: () => {
      void refreshNetwork(utils);
      setRemoveOpen(false);
      onClose();
    },
  });

  const ring = t(`circle.rings.full${Math.min(3, Math.max(1, person.depth))}`);
  const sub = [ring, person.via.length ? t('person.via', { name: person.via[person.via.length - 1] }) : null]
    .filter(Boolean)
    .join(' · ');
  const pathNames = [t('common.you'), ...person.via, person.name];

  // Sideways swipe on the card: next / previous person of the same handshake (mirrored right-to-left)
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    swipe.current = touch && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || !step || step.total < 2) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const rtl = document.documentElement.dir === 'rtl';
    if ((dx < 0) !== rtl) step.onNext();
    else step.onPrev();
  };

  const actions: Array<{ key: string; label: string; primary: boolean; onClick: () => void }> = [];
  if (person.collection) {
    actions.push({
      key: 'collection',
      label: person.collection.amount != null
        ? t('person.collectionAmount', { amount: formatMoney(person.collection.amount) })
        : t('person.openCollection'),
      primary: true,
      onClick: () => navigate(`/collection/${person.collection!.id}`),
    });
  }
  actions.push({
    key: 'open',
    label: t('person.open'),
    primary: actions.length === 0,
    onClick: () => navigate(`/person/${person.id}`),
  });
  // The phone card keeps two actions (mockup): Collection + Open, or Open + Contacts.
  if (filled.length > 0 && (variant === 'column' || actions.length < 2)) {
    actions.push({ key: 'contacts', label: t('person.contacts'), primary: false, onClick: () => setContactsOpen(true) });
  }

  const head = (
    <div className="flex items-center gap-3">
      <Avatar name={person.name} src={person.photoUrl} size={48} className="h-11 w-11 rounded-[14px] text-body-l" />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[18px] font-extrabold tracking-tight">{person.name}</b>
        <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{sub}</span>
        {person.accountName !== person.name ? (
          <span className="block truncate text-label font-semibold text-ink-muted">
            {t('person.accountName', { name: person.accountName })}
          </span>
        ) : null}
      </span>
      {variant === 'floating' ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="so-focus grid h-9 w-9 place-items-center rounded-[10px] bg-canvas text-ink-muted"
        >
          <IconClose className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <section
        className={cn(
          'rounded-xl bg-surface p-4 text-ink',
          variant === 'floating' ? 'so-sheet-in shadow-sheet' : 'shadow-card',
        )}
        aria-label={person.name}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {variant === 'column' ? (
          <button
            type="button"
            onClick={onClose}
            className="so-focus -ml-1 mb-3 inline-flex min-h-11 items-center gap-0.5 text-body-s font-bold text-care"
          >
            <IconBack className="h-5 w-5" />
            {t('circle.backToFeed')}
          </button>
        ) : null}
        {/* Keyed by person: stepping to the next one fades the content instead of swapping it */}
        <div key={person.id} className="so-fade-in">
          {head}
          <div className="mt-3.5">
            <PathFigure names={pathNames} />
          </div>
        </div>
        {step && step.total > 1 ? (
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={step.onPrev}
              aria-label={t('person.prevPerson')}
              className="so-focus grid h-9 w-9 place-items-center rounded-[10px] bg-canvas text-ink-muted transition-colors duration-fast ease-so active:bg-surface-2 rtl:rotate-180"
            >
              <IconBack className="h-4 w-4" />
            </button>
            <span className="text-label font-semibold tabular-nums text-ink-muted" aria-live="polite">
              {t('path.of', { count: step.index + 1, goal: step.total })}
            </span>
            <button
              type="button"
              onClick={step.onNext}
              aria-label={t('person.nextPerson')}
              className="so-focus grid h-9 w-9 place-items-center rounded-[10px] bg-canvas text-ink-muted transition-colors duration-fast ease-so active:bg-surface-2 rtl:rotate-180"
            >
              <IconChevron className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className={cn('mt-3.5 grid gap-2', actions.length === 1 ? 'grid-cols-1' : actions.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {actions.map((a) => (
            <Button key={a.key} size="md" variant={a.primary ? 'primary' : 'ghost'} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      </section>
      {variant === 'column' && direct ? (
        <Button variant="textDanger" className="mt-3" onClick={() => setRemoveOpen(true)}>
          {t('person.remove')}
        </Button>
      ) : null}

      <Sheet
        open={contactsOpen}
        onClose={() => setContactsOpen(false)}
        title={t('person.contactsTitle', { name: person.name })}
        description={t('person.contactsHint')}
        footer={
          <Button variant="secondary" onClick={() => setContactsOpen(false)}>
            {t('common.close')}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {filled.map((c) => {
            const href = buildContactUrl(c.type, c.value);
            if (!isSafeContactUrl(href)) return null;
            return (
              <a key={c.type} href={href} target="_blank" rel="noopener noreferrer" className="so-focus rounded-sm">
                <Pill tone="care" className="h-9 px-3 text-caption">
                  {c.label}
                </Pill>
              </a>
            );
          })}
        </div>
      </Sheet>

      <Sheet
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={t('person.removeTitle', { name: person.name })}
        description={t('person.removeBody')}
        footer={
          <>
            <Button variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate({ targetUserId: person.id })}>
              {t('person.removeConfirm')}
            </Button>
            <Button variant="secondary" onClick={() => setRemoveOpen(false)}>
              {t('person.keep')}
            </Button>
          </>
        }
      />
    </>
  );
}
