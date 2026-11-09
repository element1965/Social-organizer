import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ASK_MIN_DIRECT } from '@so/shared';
import { cn } from '../../lib/utils';
import { Button } from '../ui2/Button';
import { IconChevron } from '../ui2/icons';
import { IconCheck } from './icons';

type StartCardProps = {
  profileDone: boolean;
  direct: number;
  /** An outgoing request already counts as the first person in progress. */
  waiting: boolean;
};

function Step({ n, title, sub, done, to }: { n: number; title: string; sub: string; done: boolean; to: string }) {
  return (
    <Link
      to={to}
      className="so-focus grid min-h-[58px] grid-cols-[32px_1fr_18px] items-center gap-3 [&+&]:border-t [&+&]:border-line-soft"
    >
      <i
        className={cn(
          'grid h-8 w-8 place-items-center rounded-full text-caption font-extrabold not-italic',
          done ? 'bg-care text-care-on' : 'bg-ink text-canvas',
        )}
        aria-hidden
      >
        {done ? <IconCheck className="h-4 w-4" /> : n}
      </i>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="text-body font-bold tracking-tight text-ink">{title}</b>
        <small className="text-label font-semibold text-ink-muted">{sub}</small>
      </span>
      <IconChevron className="h-[18px] w-[18px] text-ink-subtle" />
    </Link>
  );
}

/** "You are first": three steps and one button, instead of the feed in an empty circle. */
export function StartCard({ profileDone, direct, waiting }: StartCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div>
      <div className="rounded-xl bg-surface px-4 pb-1.5 pt-3.5 shadow-card">
        <p className="mb-1 text-caption text-ink-muted">
          <b className="text-ink">{t('circle.start.lead')}</b> {t('circle.start.body')}
        </p>
        <Step n={1} title={t('circle.start.step1')} sub={t('circle.start.step1Sub')} done={profileDone} to="/me/account" />
        <Step
          n={2}
          title={t('circle.start.step2')}
          sub={waiting ? t('circle.start.step2Waiting') : t('circle.start.step2Sub')}
          done={direct > 0}
          to="/add"
        />
        <Step
          n={3}
          title={t('circle.start.step3')}
          sub={t('circle.start.step3Sub', { count: Math.min(direct, ASK_MIN_DIRECT), goal: ASK_MIN_DIRECT })}
          done={direct >= ASK_MIN_DIRECT}
          to="/add"
        />
      </div>
      <Button className="mt-2.5 w-full" onClick={() => navigate('/add')}>
        {t('nav.addPerson')}
      </Button>
    </div>
  );
}

/** "3 of 5" strip on top of the feed while the circle is small. Tap opens the path to a request. */
export function GrowStrip({ direct, onOpen }: { direct: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const ratio = Math.min(1, direct / ASK_MIN_DIRECT);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="so-focus mx-1 mb-2.5 flex w-[calc(100%-8px)] items-center gap-2.5 rounded-sm text-label font-bold text-ink-muted"
    >
      <span className="tabular-nums">{t('circle.path.of', { count: direct, goal: ASK_MIN_DIRECT })}</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-pill bg-line" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-pill bg-care" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span>{t('circle.start.step3')}</span>
    </button>
  );
}
