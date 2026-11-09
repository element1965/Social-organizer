import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ASK_MIN_DIRECT } from '@so/shared';
import { cn } from '../../lib/utils';
import { Button } from '../ui2/Button';
import { IconCheck } from './icons';

type StartCardProps = {
  profileDone: boolean;
  direct: number;
  /** An outgoing request already counts as the first person in progress. */
  waiting: boolean;
};

function Step({ n, title, sub, done }: { n: number; title: string; sub: string; done: boolean }) {
  return (
    <li className="grid min-h-[58px] grid-cols-[32px_1fr] items-center gap-3 [&+&]:border-t [&+&]:border-line-soft">
      <i
        className={cn(
          'grid h-8 w-8 place-items-center rounded-full text-caption font-extrabold not-italic',
          done ? 'bg-care text-care-on' : 'bg-surface-2 text-ink-muted',
        )}
        aria-hidden
      >
        {done ? <IconCheck className="h-4 w-4" /> : n}
      </i>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className={cn('text-body font-bold tracking-tight', done ? 'text-ink-muted' : 'text-ink')}>{title}</b>
        <small className="text-label font-semibold text-ink-muted">{sub}</small>
      </span>
    </li>
  );
}

/** "You are first": a checklist of three steps and one button, instead of the feed in an empty circle. */
export function StartCard({ profileDone, direct, waiting }: StartCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div>
      <div className="rounded-xl bg-surface px-4 pb-1.5 pt-3.5 shadow-card">
        <p className="mb-1 text-caption text-ink-muted">
          <b className="text-ink">{t('circle.start.lead')}</b> {t('circle.start.body')}
        </p>
        <ol className="list-none p-0">
          <Step n={1} title={t('circle.start.step1')} sub={t('circle.start.step1Sub')} done={profileDone} />
          <Step
            n={2}
            title={t('circle.start.step2')}
            sub={waiting ? t('circle.start.step2Waiting') : t('circle.start.step2Sub')}
            done={direct > 0}
          />
          <Step
            n={3}
            title={t('path.circle')}
            sub={t('path.of', { count: Math.min(direct, ASK_MIN_DIRECT), goal: ASK_MIN_DIRECT })}
            done={direct >= ASK_MIN_DIRECT}
          />
        </ol>
      </div>
      <Button className="mt-2.5 w-full" onClick={() => navigate('/add')}>
        {t('nav.addPerson')}
      </Button>
    </div>
  );
}
