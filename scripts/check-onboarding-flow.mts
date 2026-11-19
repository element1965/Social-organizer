import assert from 'node:assert/strict';
import * as flow from '../apps/web/src/components/onboarding/flow.ts';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'window', {
  value: {
    location: { origin: 'https://example.test' },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  },
});

for (const [name, test] of Object.entries({
  'Explicit Need wins and consumes the saved Need': () => {
    window.localStorage.setItem('pendingSosCollection', 'old-need');
    flow.setPendingInvite('old-invite');
    assert.equal(flow.afterSignInPath('alice', false, '/collection/current?sos=true'), '/collection/current?sos=true');
    assert.equal(window.localStorage.getItem('pendingSosCollection'), null);
    assert.equal(flow.afterSignInPath('bob', false), '/');
  },
  'OAuth returns to its saved Need once': () => {
    flow.savePendingSos('current');
    flow.setPendingInvite('old-invite');
    assert.equal(flow.afterSignInPath('alice', false), '/collection/current?sos=true');
    assert.equal(flow.afterSignInPath('alice', false), '/');
  },
  'A Telegram Need link wins over a stored invite': () => {
    flow.setPendingInvite('old-invite');
    const telegramTarget = flow.telegramStartPath('sos_current');
    assert.equal(
      flow.afterSignInPath('alice', true, telegramTarget),
      '/seed?first=1&next=%2Fcollection%2Fcurrent%3Fsos%3Dtrue',
    );
    assert.equal(flow.readPendingInvite(), null);
  },
  'First run survives sign-ins and is scoped to each account': () => {
    assert.equal(flow.afterSignInPath('alice', true), '/intro?first=1');
    assert.equal(flow.isFirstRunPending('alice'), true);
    assert.equal(flow.isFirstRunPending('bob'), false);
    assert.equal(flow.afterSignInPath('alice', false), '/intro?first=1');
    flow.markFirstRun('bob');
    flow.clearFirstRun('alice');
    assert.equal(flow.isFirstRunPending('alice'), false);
    assert.equal(flow.isFirstRunPending('bob'), true);
  },
})) {
  values.clear();
  try {
    test();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}
