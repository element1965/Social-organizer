/**
 * Check of the in-memory shake matcher with an injected clock. No database, no network.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/check-shake-matcher.ts
 */
import {
  registerShake,
  getShakeStatus,
  getTicketOwner,
  __resetShakeState,
  __setShakeClock,
} from '../src/services/shake.service.js';

let t = 1_000_000;
const advance = (ms: number) => {
  t += ms;
};
const fresh = () => {
  __resetShakeState();
  __setShakeClock(() => t);
  t += 100_000;
};

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// Same IP, two people: both matched with each other
fresh();
{
  const a = registerShake({ userId: 'A', ip: '1.1.1.1' });
  advance(300);
  const b = registerShake({ userId: 'B', ip: '1.1.1.1' });
  advance(600);
  const sa = getShakeStatus(a);
  const sb = getShakeStatus(b);
  check(
    'same-IP pair matches',
    sa.state === 'matched' && sb.state === 'matched' && sa.otherUserId === 'B' && sb.otherUserId === 'A' && sa.pair === sb.pair,
  );
}

// Far apart geo never matches, even from the same IP
fresh();
{
  const a = registerShake({ userId: 'A', ip: '1.1.1.1', geo: { lat: 52.52, lng: 13.4, accuracy: 20 } });
  const b = registerShake({ userId: 'B', ip: '1.1.1.1', geo: { lat: 48.85, lng: 2.35, accuracy: 20 } });
  advance(1000);
  check('far-apart geo does not match', getShakeStatus(a).state === 'searching' && getShakeStatus(b).state === 'searching');
  advance(6000);
  check('far-apart geo ends as none', getShakeStatus(a).state === 'none' && getShakeStatus(b).state === 'none');
}

// Close geo with different IPs matches
fresh();
{
  const a = registerShake({ userId: 'A', ip: '1.1.1.1', geo: { lat: 52.52, lng: 13.4, accuracy: 20 } });
  const b = registerShake({ userId: 'B', ip: '2.2.2.2', geo: { lat: 52.5201, lng: 13.4001, accuracy: 20 } });
  advance(600);
  check('close geo with different IPs matches', getShakeStatus(a).state === 'matched' && getShakeStatus(b).state === 'matched');
}

// Three simultaneous same-IP shakes: crowded
fresh();
{
  const a = registerShake({ userId: 'A', ip: '1.1.1.1' });
  advance(100);
  const b = registerShake({ userId: 'B', ip: '1.1.1.1' });
  advance(100);
  const c = registerShake({ userId: 'C', ip: '1.1.1.1' });
  advance(700);
  check(
    'three same-IP shakes are crowded',
    [a, b, c].every((x) => getShakeStatus(x).state === 'crowded'),
    [a, b, c].map((x) => getShakeStatus(x).state).join(','),
  );
}

// A lone shake: searching, then none after 6 s
fresh();
{
  const a = registerShake({ userId: 'A', ip: '1.1.1.1' });
  advance(1000);
  check('lone shake is searching at 1 s', getShakeStatus(a).state === 'searching');
  advance(5200);
  check('lone shake is none after 6 s', getShakeStatus(a).state === 'none');
}

// Shakes far apart in time never match
fresh();
{
  const a = registerShake({ userId: 'A', ip: '1.1.1.1' });
  advance(4000);
  const b = registerShake({ userId: 'B', ip: '1.1.1.1' });
  advance(700);
  check('shakes 4 s apart do not match', getShakeStatus(b).state === 'searching');
  void a;
}

// Re-register replaces the previous entry
fresh();
{
  const a1 = registerShake({ userId: 'A', ip: '1.1.1.1' });
  advance(200);
  const a2 = registerShake({ userId: 'A', ip: '1.1.1.1' });
  check('re-register drops the old ticket', getTicketOwner(a1) === null && getTicketOwner(a2) === 'A');
  advance(100);
  const b = registerShake({ userId: 'B', ip: '1.1.1.1' });
  advance(700);
  const s = getShakeStatus(b);
  check('re-registered user pairs once, with the new entry', s.state === 'matched' && getShakeStatus(a2).state === 'matched');
}

__resetShakeState();
if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
