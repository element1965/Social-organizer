import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Clock } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Avatar } from './ui/avatar';

const seenKey = (meId: string, personId: string) => `acquaintanceSeen:${meId}:${personId}`;

function wasSeen(meId: string, personId: string): boolean {
  try { return localStorage.getItem(seenKey(meId, personId)) === '1'; } catch { return false; }
}
function markSeen(meId: string, personId: string) {
  try { localStorage.setItem(seenKey(meId, personId), '1'); } catch { /* storage blocked — card just shows again */ }
}

/**
 * First acquaintance after sign-in (money MVP, "Acquaintance" mockup).
 * waiting   — the request is sent, the other person has not answered yet; the app stays usable.
 * connected — both confirmed; one main action "Open my network" (shown once).
 * declined / personDeleted — a clear next step: invite someone you know personally.
 * none      — nothing here; the dashboard shows the personal link / QR block.
 */
export function AcquaintanceCard({ onInvite }: { onInvite: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = trpc.user.me.useQuery();
  const utils = trpc.useUtils();
  const { data } = trpc.pending.introStatus.useQuery(undefined, { refetchInterval: 15000 });
  // When the acquaintance gets confirmed, refresh network numbers right away (they are cached)
  const state = data?.state;
  useEffect(() => {
    if (state === 'connected') utils.connection.getNetworkStats.invalidate();
  }, [state, utils]);
  const [hidden, setHidden] = useState(false);

  if (!data || !me || data.state === 'none' || !data.person || hidden) return null;
  const person = data.person;
  const name = person.name;

  const pair = (
    <div className="flex items-center justify-center gap-1 mb-3" aria-hidden="true">
      <Avatar src={me?.photoUrl} name={me?.name} size="lg" />
      <span className="w-3 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
      <span className={`w-6 h-6 rounded-full flex items-center justify-center ${data.state === 'connected' ? 'bg-teal-600 text-white' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600'}`}>
        {data.state === 'connected' ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
      </span>
      <span className="w-3 border-t-2 border-dashed border-gray-300 dark:border-gray-600" />
      <Avatar src={person.photoUrl} name={name} size="lg" />
    </div>
  );

  if (data.state === 'connected') {
    if (wasSeen(me.id, person.id)) return null;
    return (
      <Card>
        <CardContent className="py-5 text-center">
          {pair}
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('acquaintance.connectedTitle', { name })}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">{t('acquaintance.connectedText')}</p>
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-3 text-left mb-3">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('acquaintance.firstHandshake', { name })}</p>
            <p className="text-sm text-gray-500 dark:text-gray-300">{t('acquaintance.firstHandshakeText')}</p>
          </div>
          <Button
            className="w-full"
            size="lg"
            onClick={() => { markSeen(me.id, person.id); setHidden(true); navigate('/network'); }}
          >
            {t('acquaintance.openNetwork')}
          </Button>
          <p className="text-xs text-gray-400 dark:text-gray-400 mt-3">{t('acquaintance.addPeopleHint')}</p>
        </CardContent>
      </Card>
    );
  }

  if (data.state === 'waiting') {
    return (
      <Card>
        <CardContent className="py-5 text-center">
          {pair}
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1">{t('acquaintance.waitingBadge')}</p>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('acquaintance.waitingTitle', { name })}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-300">{t('acquaintance.waitingText', { name })}</p>
        </CardContent>
      </Card>
    );
  }

  // declined or personDeleted
  return (
    <Card>
      <CardContent className="py-5 text-center">
        <Avatar src={person.photoUrl} name={name} size="lg" className="mx-auto mb-3" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
          {data.state === 'declined' ? t('acquaintance.declinedTitle', { name }) : t('acquaintance.deletedTitle', { name })}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-300 mb-3">{t('acquaintance.nextStepText')}</p>
        <Button className="w-full" size="lg" onClick={onInvite}>{t('acquaintance.inviteSomeone')}</Button>
      </CardContent>
    </Card>
  );
}
