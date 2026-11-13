import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LiveQr } from '../components/add/LiveQr';
import { announceJoin, sliceSize, useJoining } from '../components/circle/joining';
import { EnableShakeButton } from '../components/shake/EnableShakeButton';
import { useBanner } from '../components/ui2/Banner';
import { Screen } from '../components/ui2/Screen';
import { refreshNetwork } from '../lib/refreshNetwork';
import { trpc } from '../lib/trpc';

/** While my code is on screen someone may scan it any second: the cheap count is watched closely. */
const SCAN_WATCH_MS = 4_000;

export function QrPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const banner = useBanner();
  const count = trpc.connection.getCount.useQuery(undefined, { refetchInterval: SCAN_WATCH_MS });
  const last = useRef<number | null>(null);

  // The other phone scanned this code: tell at once and start loading the new part of the network,
  // so the Circle already has it when the person goes back there.
  useEffect(() => {
    const now = count.data?.count;
    if (now === undefined) return;
    const grew = last.current !== null && now > last.current;
    last.current = now;
    if (!grew) return;
    const before = sliceSize(utils);
    void refreshNetwork(utils)
      .then(() => announceJoin(utils, undefined, before))
      .then(() => {
        const person = useJoining.getState().person;
        if (person) banner.show({ kicker: t('common.appName'), title: t('circle.join.title', { name: person.name }) });
      });
  }, [count.data?.count, utils, banner, t]);

  return (
    <Screen title={t('add.myQr')} back={{ label: t('nav.add'), to: '/add' }} width="column" fill>
      <LiveQr onScan={() => navigate('/add/scan')} onDone={() => navigate('/add')}>
        <EnableShakeButton className="mt-2 w-full" />
      </LiveQr>
    </Screen>
  );
}
