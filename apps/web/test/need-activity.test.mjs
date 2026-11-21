import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupNeedActivity } from '../src/hooks/needActivity.ts';

test('keeps renewal reminders in activity while a current-cycle confirmation waits', () => {
  const waiting = { id: 'waiting', cycleNumber: 3 };
  const other = { id: 'other', cycleNumber: 3 };
  const notice = (id, type, collection, wave) => ({
    id, type, collection, wave, status: 'UNREAD', createdAt: '2026-11-21T12:00:00.000Z',
  });
  const { confirmations, activity } = groupNeedActivity([{ collection: waiting, amount: 10 }], [
    notice('reminder', 'CYCLE_RENEWAL_REMINDER', waiting, 3),
    notice('current-renewed', 'CYCLE_RENEWED', waiting, 3),
    notice('earlier-renewed', 'CYCLE_RENEWED', waiting, 2),
    notice('other-renewed', 'CYCLE_RENEWED', other, 3),
  ]);

  assert.equal(confirmations.length, 1);
  assert.deepEqual(activity.map((row) => row.notificationIds), [
    ['reminder', 'earlier-renewed'],
    ['other-renewed'],
  ]);
  assert.notEqual(confirmations[0].id, activity[0].id);
});
