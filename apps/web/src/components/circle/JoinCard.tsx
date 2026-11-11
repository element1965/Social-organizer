import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui2/Avatar';
import { IconCheck } from '../add/icons';
import type { CircleNetwork } from './network';

/** How long the "done" state stays before the card leaves. */
const DONE_MS = 4_000;

/**
 * A person has just joined my circle. They are already drawn on the first ring; the card says the rest of their
 * network is on its way (the graph slice can take a while for a big network) and how much it grew once it is in.
 */
export function JoinCard({ joining, onDone }: { joining: NonNullable<CircleNetwork['joining']>; onDone: () => void }) {
  const { t } = useTranslation();
  const { person, loaded, added } = joining;

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(onDone, DONE_MS);
    return () => window.clearTimeout(timer);
  }, [loaded, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="so-join-in relative mb-3 flex items-center gap-3 overflow-hidden rounded-lg bg-care-soft px-3 py-2.5"
    >
      <style>
        {`@keyframes so-join-orbit { to { transform: rotate(360deg); } }
          @keyframes so-join-ping { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.9); opacity: 0; } }
          @keyframes so-join-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
          @keyframes so-join-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
          .so-join-in { animation: so-join-in 320ms cubic-bezier(0.22, 0.8, 0.24, 1) both; }
          @media (prefers-reduced-motion: reduce) {
            .so-join-in, .so-join-anim { animation: none !important; }
          }`}
      </style>
      <span className="relative grid h-10 w-10 shrink-0 place-items-center">
        {loaded ? null : (
          <>
            {/* A ring of light around the person: their network is still coming in */}
            <span
              aria-hidden
              className="so-join-anim absolute inset-0 rounded-full bg-care/25"
              style={{ animation: 'so-join-ping 1.6s cubic-bezier(0.2, 0.6, 0.3, 1) infinite' }}
            />
            <span
              aria-hidden
              className="so-join-anim absolute -inset-[3px] rounded-full border-2 border-transparent border-t-care border-r-care/40"
              style={{ animation: 'so-join-orbit 1.1s linear infinite' }}
            />
          </>
        )}
        <Avatar name={person.name} src={person.photoUrl} size={36} />
        {loaded ? (
          <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-care text-care-on ring-2 ring-care-soft">
            <IconCheck className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-label font-bold text-ink">{t('circle.join.title', { name: person.name })}</p>
        <p className="truncate text-micro font-semibold text-care">
          {loaded ? (added > 0 ? t('circle.join.added', { count: added }) : t('circle.join.ready')) : t('circle.join.loading')}
        </p>
      </div>
      {loaded ? null : (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-care/10">
          <span
            className="so-join-anim block h-full w-2/5 rounded-pill bg-care"
            style={{ animation: 'so-join-bar 1.3s cubic-bezier(0.45, 0, 0.55, 1) infinite' }}
          />
        </span>
      )}
    </div>
  );
}
