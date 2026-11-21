type Need = { id: string; cycleNumber: number };

type Notice<T extends Need> = {
  id: string;
  type: string;
  status: string;
  wave: number;
  createdAt: string | Date;
  collection: T | null;
};

type Activity<T extends Need> = {
  id: string;
  collection: T;
  notice: Notice<T>;
  isCycle: boolean;
  notificationIds: string[];
};

const REQUEST_TYPES = new Set(['NEW_COLLECTION', 'RE_NOTIFY', 'SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER']);

export function groupNeedActivity<T extends Need, R extends Need>(
  waitingRenewals: readonly { collection: R; amount: number }[],
  items: readonly Notice<T>[],
) {
  const renewalWaves = new Map(waitingRenewals.map(({ collection }) => [collection.id, collection.cycleNumber]));
  const confirmations = waitingRenewals.map((renewal) => ({
    ...renewal,
    id: `n:cycle-confirmation:${renewal.collection.id}:${renewal.collection.cycleNumber}`,
  }));

  const requests: { collectionId: string; notificationId: string }[] = [];
  const activity = new Map<string, Activity<T>>();
  for (const notice of items) {
    const { collection, type, status, id } = notice;
    if (!collection || status !== 'UNREAD') continue;
    if (REQUEST_TYPES.has(type)) {
      requests.push({ collectionId: collection.id, notificationId: id });
      continue;
    }

    const isCycle = type === 'CYCLE_RENEWED' || type === 'CYCLE_RENEWAL_REMINDER';
    if (type === 'CYCLE_RENEWED' && renewalWaves.get(collection.id) === notice.wave) continue;

    const key = `${isCycle ? 'cycle' : type}:${collection.id}`;
    const existing = activity.get(key);
    if (existing) {
      existing.notificationIds.push(id);
    } else {
      activity.set(key, { id: `n:${key}`, collection, notice, isCycle, notificationIds: [id] });
    }
  }
  return { confirmations, requests, activity: [...activity.values()] };
}
