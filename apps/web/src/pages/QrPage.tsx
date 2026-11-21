import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LiveQr } from '../components/add/LiveQr';
import { announceJoin, sliceSize } from '../components/circle/joining';
import { EnableShakeButton } from '../components/shake/EnableShakeButton';
import { useBanner } from '../components/ui2/Banner';
import { Screen } from '../components/ui2/Screen';
import { refreshNetwork } from '../lib/refreshNetwork';
import { trpc } from '../lib/trpc';

const SCAN_WATCH_MS = 4_000;
const CLAIM_BATCH_SIZE = 60;

export function QrPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const banner = useBanner();
  const pending = useRef(new Set<string>());
  const [claimedIds, setClaimedIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let stopped = false;
    let checking = false;
    const poll = async () => {
      if (checking || document.hidden || pending.current.size === 0) return;
      checking = true;
      try {
        const ids = [...pending.current];
        for (let i = 0; i < ids.length; i += CLAIM_BATCH_SIZE) {
          const settled = await utils.client.invite.liveClaims.query({ inviteIds: ids.slice(i, i + CLAIM_BATCH_SIZE) });
          if (stopped) return;
          const claims = settled.filter(({ id, claimed }) => pending.current.delete(id) && claimed);
          if (claims.length === 0) continue;
          setClaimedIds((previous) => new Set([...previous, ...claims.map(({ id }) => id)]));
          const before = sliceSize(utils);
          void refreshNetwork(utils);
          const person = claims.at(-1)?.person;
          if (person) {
            void announceJoin(utils, person, before);
            banner.show({ kicker: t('common.appName'), title: t('circle.join.title', { name: person.name }) });
          }
        }
      } catch {
        // Keep unsettled tokens and retry at the next poll.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void poll(), SCAN_WATCH_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [utils, banner, t]);

  return (
    <Screen title={t('add.myQr')} back={{ label: t('nav.add'), to: '/add' }} width="column" fill>
      <LiveQr
        claimedIds={claimedIds}
        onIssued={(id) => pending.current.add(id)}
        onScan={() => navigate('/add/scan')}
        onDone={() => navigate('/add')}
      >
        <EnableShakeButton className="mt-2 w-full" />
      </LiveQr>
    </Screen>
  );
}
