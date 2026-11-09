import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { trpc } from '../../lib/trpc';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { formatMoney } from '../ui2/format';
import { Sheet } from '../ui2/Sheet';
import { useShellMode } from '../ui2/shell-mode';
import { IconCheck } from './icons';
import { ParticipantList, type ParticipantRow } from './ParticipantList';

const UNDO_MS = 5000;

type Undo = { text: string; ids: string[]; paid: boolean; key: number };

/**
 * Transfer marks for the author of a collection: one tap marks or unmarks right away (no dialog),
 * several can be marked at once, and every change can be undone for a few seconds.
 * The mark shows at once (local override) and stays until the server data agrees.
 */
export function usePaidMarks(rows: ParticipantRow[], onSaved: () => void) {
  const { t } = useTranslation();
  const [override, setOverride] = useState<Map<string, boolean>>(new Map());
  const [undo, setUndo] = useState<Undo | null>(null);
  const [failed, setFailed] = useState(false);
  const setPaid = trpc.obligation.setPaid.useMutation();

  // Drop overrides the server has caught up with
  useEffect(() => {
    setOverride((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const row of rows) if (next.get(row.id) === row.paid) next.delete(row.id);
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const people = useMemo(
    () => rows.map((row) => (override.has(row.id) ? { ...row, paid: override.get(row.id)! } : row)),
    [rows, override],
  );

  const apply = useCallback(
    (ids: string[], paid: boolean, text: string | null) => {
      if (ids.length === 0) return;
      setFailed(false);
      setOverride((prev) => {
        const next = new Map(prev);
        for (const id of ids) next.set(id, paid);
        return next;
      });
      setUndo(text ? { text, ids, paid, key: Date.now() } : null);
      setPaid.mutate(
        { obligationIds: ids, paid },
        {
          onSuccess: onSaved,
          onError: () => {
            // Put the rows back and say so
            setOverride((prev) => {
              const next = new Map(prev);
              for (const id of ids) next.delete(id);
              return next;
            });
            setUndo(null);
            setFailed(true);
          },
        },
      );
    },
    [setPaid, onSaved],
  );

  const toggle = useCallback(
    (row: ParticipantRow) => {
      const current = override.get(row.id) ?? row.paid;
      const paid = !current;
      apply([row.id], paid, t(paid ? 'collection.markedOne' : 'collection.unmarkedOne', { name: row.name }));
    },
    [apply, override, t],
  );

  const markMany = useCallback(
    (selected: ParticipantRow[]) => {
      if (selected.length === 1) {
        apply([selected[0]!.id], true, t('collection.markedOne', { name: selected[0]!.name }));
      } else {
        apply(selected.map((row) => row.id), true, t('collection.markedMany', { n: selected.length }));
      }
    },
    [apply, t],
  );

  const undoLast = useCallback(() => {
    if (!undo) return;
    apply(undo.ids, !undo.paid, null);
  }, [apply, undo]);

  // Stable, so the undo bar timer is not restarted by every re-render
  const dismissUndo = useCallback(() => setUndo(null), []);

  return { people, toggle, markMany, undo, undoLast, dismissUndo, failed };
}

/** "Marked · Undo" bar above the tab bar (or at the bottom of the window on desktop). */
export function UndoBar({ undo, onUndo, onDone }: { undo: Undo | null; onUndo: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const tabs = useShellMode() === 'tabs';
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(onDone, UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo, onDone]);
  if (!undo) return null;
  return (
    <div
      role="status"
      key={undo.key}
      className={cn(
        'fixed inset-x-4 z-40 mx-auto flex max-w-[480px] items-center gap-3 rounded-lg bg-ink py-2 pl-4 pr-2 text-canvas shadow-sheet',
        tabs ? 'bottom-[calc(84px+var(--sa-bottom)+12px)]' : 'bottom-6',
      )}
    >
      <span className="min-w-0 flex-1 truncate text-body-s font-semibold">{undo.text}</span>
      <button type="button" onClick={onUndo} className="so-focus h-10 shrink-0 rounded-md px-3 text-body-s font-extrabold text-care-bright">
        {t('collection.undo')}
      </button>
    </div>
  );
}

/** Sheet with everyone whose transfer is not marked yet: tick the ones that arrived, confirm once. */
export function MarkTransfersSheet({
  open,
  people,
  onClose,
  onConfirm,
}: {
  open: boolean;
  people: ParticipantRow[];
  onClose: () => void;
  onConfirm: (rows: ParticipantRow[]) => void;
}) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setPicked(new Set());
    wasOpen.current = open;
  }, [open]);

  const all = people.length > 0 && picked.size === people.length;
  const chosen = people.filter((row) => picked.has(row.id));
  const sum = chosen.reduce((acc, row) => acc + row.amount, 0);
  const flip = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('collection.markTitle')}
      description={t('collection.markHint')}
      footer={
        <Button className="w-full" disabled={chosen.length === 0} onClick={() => onConfirm(chosen)}>
          {chosen.length === 0
            ? t('collection.markPick')
            : t('collection.markConfirm', { n: chosen.length, sum: formatMoney(sum) })}
        </Button>
      }
    >
      <button
        type="button"
        aria-pressed={all}
        onClick={() => setPicked(all ? new Set() : new Set(people.map((row) => row.id)))}
        className="so-focus mb-2 flex min-h-row w-full items-center gap-3 rounded-lg bg-surface-2 px-4 py-2 text-left"
      >
        <span className="min-w-0 flex-1 text-body font-bold text-ink">{t('collection.selectAll', { n: people.length })}</span>
        <Tick on={all} />
      </button>
      <ul className="divide-y divide-line-soft overflow-hidden rounded-lg bg-surface">
        {people.map((row) => {
          const on = picked.has(row.id);
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => flip(row.id)}
                className="so-focus flex min-h-row w-full items-center gap-3 px-4 py-2 text-left"
              >
                <Avatar name={row.name} src={row.photoUrl} size={36} />
                <span className="min-w-0 flex-1 truncate text-body font-body text-ink">{row.name}</span>
                <span className="text-body font-extrabold tabular-nums text-ink">{formatMoney(row.amount)}</span>
                <Tick on={on} />
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-7 w-7 shrink-0 place-items-center rounded-sm border',
        on ? 'border-care bg-care text-care-on' : 'border-line bg-canvas text-transparent',
      )}
    >
      <IconCheck className="h-4 w-4" />
    </span>
  );
}

/** The participants list with transfer marks for the author: one-tap marks, the sheet, the undo bar. */
export function MarkableParticipantList({
  people: rows,
  onPerson,
  onRemove,
  onSaved,
}: {
  people: ParticipantRow[];
  onPerson: (userId: string) => void;
  onRemove: (row: ParticipantRow) => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const marks = usePaidMarks(rows, onSaved);
  const [sheetOpen, setSheetOpen] = useState(false);
  const unpaid = marks.people.filter((row) => !row.paid);
  return (
    <>
      <ParticipantList
        people={marks.people}
        showPaid
        onPerson={onPerson}
        onPaid={marks.toggle}
        onRemove={onRemove}
        onMarkMany={() => setSheetOpen(true)}
      />
      {marks.failed ? <p role="alert" className="mt-2 px-1 text-label font-semibold text-sos">{t('collection.markError')}</p> : null}
      <MarkTransfersSheet
        open={sheetOpen}
        people={unpaid}
        onClose={() => setSheetOpen(false)}
        onConfirm={(chosen) => {
          setSheetOpen(false);
          marks.markMany(chosen);
        }}
      />
      <UndoBar undo={marks.undo} onUndo={marks.undoLast} onDone={marks.dismissUndo} />
    </>
  );
}
