import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Screen } from '../components/ui2/Screen';
import { ArrivalList } from '../components/add/ArrivalList';
import { ConfirmSheet } from '../components/add/ConfirmSheet';
import { LinkCard } from '../components/add/LinkCard';
import { SuggestList } from '../components/add/SuggestList';
import { inviteSlug } from '../components/add/links';
import { ShakeHint } from '../components/shake/ShakeHint';
import { PathCard } from '../components/circle/PathToRequest';
import { trpc } from '../lib/trpc';

interface ConfirmPerson {
  pendingId: string;
  name: string;
}

export function AddPage() {
  const { t } = useTranslation();
  const me = trpc.user.me.useQuery();
  // A request through my link can arrive while this screen is open
  const incoming = trpc.pending.incoming.useQuery(undefined, { refetchInterval: 20_000 });
  const connections = trpc.connection.list.useQuery();
  const [confirm, setConfirm] = useState<ConfirmPerson | null>(null);

  const pending = (incoming.data ?? []).map((item) => ({
    pendingId: item.id,
    id: item.fromUser.id,
    name: item.fromUser.name,
    photoUrl: item.fromUser.photoUrl,
    at: new Date(item.createdAt),
  }));
  const connected = (connections.data ?? []).map((item) => ({
    id: item.userId,
    name: item.displayName || item.name,
    photoUrl: item.photoUrl,
    at: new Date(item.createdAt),
    connections: item.connectionCount,
  }));
  // Nicknames the person gave their acquaintances, for "through whom" in the suggestions
  const names = new Map((connections.data ?? []).map((item) => [item.userId, item.displayName || item.name]));
  const listFailed = incoming.isError || connections.isError;
  const listLoading = incoming.isLoading || connections.isLoading;
  const total = pending.length + connected.length;

  return (
    <Screen width="column">
      <h1 className="pt-6 text-h1 font-extrabold text-ink">{t('nav.add')}</h1>
      {me.data ? (
        <LinkCard slug={inviteSlug(me.data)} name={me.data.name} customSlug={me.data.referralSlug} />
      ) : (
        <Card className="mt-4" aria-busy="true">
          <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
        </Card>
      )}
      <ShakeHint className="mt-4" />
      {/* While asking is locked, the explanation sits below the link: the link is what to do first. */}
      <PathCard className="mt-4" />
      <SuggestList className="mt-4" names={names} />
      {listFailed ? (
        <div className="mt-4">
          <p className="text-label font-semibold text-sos">{t('add.loadError')}</p>
          <Button className="mt-3" variant="secondary" onClick={() => { void incoming.refetch(); void connections.refetch(); }}>
            {t('common.retry')}
          </Button>
        </div>
      ) : listLoading ? (
        <p className="mt-4 px-1 text-label font-semibold text-ink-muted">{t('common.loading')}</p>
      ) : total === 0 ? (
        <p className="mt-4 px-1 text-caption font-semibold text-ink-muted">{t('add.empty')}</p>
      ) : (
        <ArrivalList pending={pending} connected={connected} onConfirm={setConfirm} />
      )}
      <ConfirmSheet key={confirm?.pendingId ?? 'closed'} person={confirm} onClose={() => setConfirm(null)} />
    </Screen>
  );
}
