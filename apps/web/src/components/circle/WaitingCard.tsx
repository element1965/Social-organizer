import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shareLink } from '../../lib/share';
import { appOrigin } from '../add/links';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { LiveNotice } from '../ui2/LiveNotice';
import { IconClock } from './icons';

export type WaitingPerson = { id: string; name: string; photoUrl: string | null };

/**
 * The empty Circle while my request waits (audit A2): who has to confirm, what appears once they do, and a way to
 * remind them through my own messenger (a share; the app itself sends nobody anything). The other person's
 * gender is never known, so the copy repeats the name instead of a pronoun.
 */
export function WaitingCard({ person }: { person: WaitingPerson }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const name = person.name.trim().split(/\s+/)[0] || person.name;

  const remind = async () => {
    try {
      const outcome = await shareLink({
        title: t('common.appName'),
        text: t('circle.waiting.remindText', { name }),
        url: appOrigin(),
      });
      if (outcome === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="relative shrink-0">
          <Avatar name={person.name} src={person.photoUrl} size={48} />
          <span className="absolute -bottom-0.5 -end-0.5 grid h-5 w-5 place-items-center rounded-full bg-warm-soft text-warm-ink ring-2 ring-surface">
            <IconClock className="h-3 w-3" />
          </span>
        </span>
        <p className="min-w-0 text-body-s font-extrabold text-ink">{t('circle.waiting.title', { name })}</p>
      </div>
      <p className="mt-2.5 text-caption font-semibold text-ink-muted">{t('circle.waiting.text', { name })}</p>
      <Button variant="secondary" size="md" className="mt-3 w-full" onClick={() => void remind()}>
        {copied ? t('common.copied') : t('path.remind')}
      </Button>
      <LiveNotice>{copied ? t('common.copied') : null}</LiveNotice>
    </div>
  );
}
