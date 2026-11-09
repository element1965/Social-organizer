/**
 * Local development seed: fictional people only (e-mails on the reserved test.local domain).
 * Wipes and refills a LOCAL database. Refuses to run against anything but localhost.
 *
 *   cd packages/db && npx tsx prisma/seed-dev.ts
 *
 * Accounts (sign in with "E-mail: we'll send a code"; the dev API writes the code to %TEMP%\so-dev-mail.log):
 *   anna@test.local   active member: 6 direct connections, 3-level network, collections, notifications,
 *                     an incoming acquaintance request
 *   new@test.local    brand-new member with an empty circle (onboarding)
 *   maria@test.local  author of an active emergency collection
 *   big@test.local    large network: 36 direct connections, ~250 people over three levels, its own collections
 */
import { PrismaClient, type User } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '';
// A staging database may be seeded only when its exact host:port is named in SEED_DEV_ALLOW_HOST,
// so a production URL left in the environment is never wiped by accident.
const allowHost = process.env.SEED_DEV_ALLOW_HOST;
const isLocal = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
const isAllowedRemote = !!allowHost && url.includes(`@${allowHost}/`);
if (!isLocal && !isAllowedRemote) {
  console.error('seed-dev: DATABASE_URL is not a local database (or SEED_DEV_ALLOW_HOST), refusing to run.');
  process.exit(1);
}

const db = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const inDays = (days: number) => new Date(Date.now() + days * DAY);

type Person = { key: string; name: string; city?: string; budget?: number; lang?: string };

// Level 1 = Anna's direct connections, level 2/3 = friends of friends
const PEOPLE: Person[] = [
  { key: 'anna', name: 'Anna Petrova', city: 'Taipei', budget: 50, lang: 'ru' },
  { key: 'new', name: 'Nika Novak', lang: 'ru' },
  // level 1
  { key: 'maria', name: 'Maria Lee', city: 'Taipei', budget: 30 },
  { key: 'oleg', name: 'Oleg Sokolov', city: 'Hong Kong', budget: 20 },
  { key: 'chen', name: 'Chen Wei', city: 'Taipei', budget: 40 },
  { key: 'sofia', name: 'Sofia Rossi', city: 'Milan', budget: 10 },
  { key: 'david', name: 'David Cohen', city: 'Haifa', budget: 25 },
  { key: 'lina', name: 'Lina Haddad', city: 'Taipei', budget: 15 },
  // level 2
  { key: 'tom', name: 'Tom Becker', budget: 10 },
  { key: 'yuki', name: 'Yuki Tanaka', budget: 20 },
  { key: 'pablo', name: 'Pablo Ruiz', budget: 5 },
  { key: 'mei', name: 'Mei Lin', budget: 30 },
  { key: 'ivan', name: 'Ivan Horak', budget: 10 },
  { key: 'sara', name: 'Sara Nilsson', budget: 15 },
  { key: 'ali', name: 'Ali Karimi', budget: 10 },
  // level 3
  { key: 'eva', name: 'Eva Novak', budget: 5 },
  { key: 'jon', name: 'Jon Berg', budget: 10 },
  { key: 'rina', name: 'Rina Sato', budget: 20 },
  { key: 'max', name: 'Max Weber', budget: 5 },
  // will ask Anna to connect
  { key: 'kate', name: 'Kate Moroz', city: 'Taipei', budget: 10 },
];

const EDGES: [string, string][] = [
  // Anna's circle
  ['anna', 'maria'], ['anna', 'oleg'], ['anna', 'chen'], ['anna', 'sofia'], ['anna', 'david'], ['anna', 'lina'],
  ['maria', 'chen'], ['oleg', 'david'],
  // level 2
  ['maria', 'tom'], ['maria', 'yuki'], ['chen', 'mei'], ['chen', 'pablo'], ['sofia', 'ivan'], ['david', 'sara'], ['lina', 'ali'],
  ['tom', 'yuki'],
  // level 3
  ['tom', 'eva'], ['mei', 'jon'], ['sara', 'rina'], ['ali', 'max'],
];

async function wipe() {
  // Child tables first; users cascade the rest
  await db.notification.deleteMany();
  await db.obligation.deleteMany();
  await db.collection.deleteMany();
  await db.pendingConnection.deleteMany();
  await db.connection.deleteMany();
  await db.userMilestone.deleteMany();
  await db.inviteLink.deleteMany();
  await db.emailLoginCode.deleteMany();
  await db.user.deleteMany();
}

async function main() {
  await wipe();

  const u: Record<string, User> = {};
  for (const [i, p] of PEOPLE.entries()) {
    u[p.key] = await db.user.create({
      data: {
        name: p.name,
        email: `${p.key}@test.local`,
        emailVerifiedAt: ago(60 - i),
        language: p.lang ?? 'en',
        city: p.city,
        monthlyBudget: p.budget,
        remainingBudget: p.budget,
        budgetUpdatedAt: p.budget ? ago(3) : undefined,
        onboardingCompleted: p.key !== 'new',
        createdAt: ago(p.key === 'new' ? 0 : 60 - i),
        lastSeen: ago(i % 5),
        contacts: p.key === 'new' ? undefined : { create: [{ type: 'telegram', value: `${p.key}_test` }] },
      },
    });
  }

  for (const [i, [a, b]] of EDGES.entries()) {
    // Invariant: userAId < userBId
    const [x, y] = [u[a]!.id, u[b]!.id].sort();
    await db.connection.create({ data: { userAId: x!, userBId: y!, createdAt: ago(50 - i) } });
  }

  await db.userMilestone.create({
    data: { userId: u.anna!.id, kind: 'FIRST_CONNECTION', achievedAt: ago(50), relatedUserId: u.maria!.id, seenAt: ago(50) },
  });

  // Incoming acquaintance request for Anna
  await db.pendingConnection.create({ data: { fromUserId: u.kate!.id, toUserId: u.anna!.id, createdAt: ago(0.1) } });

  // Maria's active emergency collection: Anna and others have pledged
  const emergency = await db.collection.create({
    data: {
      creatorId: u.maria!.id, type: 'EMERGENCY', amount: 300, chatLink: 'https://t.me/+test_maria_help',
      status: 'ACTIVE', createdAt: ago(2),
    },
  });
  for (const [key, amount] of [['chen', 40], ['tom', 20], ['yuki', 30], ['oleg', 10]] as const) {
    await db.obligation.create({ data: { collectionId: emergency.id, userId: u[key]!.id, amount, createdAt: ago(1) } });
  }
  await db.notification.create({
    data: {
      userId: u.anna!.id, collectionId: emergency.id, type: 'NEW_COLLECTION',
      handshakePath: [u.maria!.id, u.anna!.id], expiresAt: inDays(1), createdAt: ago(0.2),
    },
  });

  // Anna's own regular (every 28 days) collection
  const regular = await db.collection.create({
    data: {
      creatorId: u.anna!.id, type: 'REGULAR', amount: 120, chatLink: 'https://t.me/+test_anna_regular',
      status: 'ACTIVE', currentCycleStart: ago(5), createdAt: ago(5),
    },
  });
  for (const [key, amount] of [['maria', 20], ['lina', 15], ['david', 25]] as const) {
    await db.obligation.create({
      data: { collectionId: regular.id, userId: u[key]!.id, amount, isSubscription: true, createdAt: ago(4) },
    });
  }
  await db.notification.create({
    data: {
      userId: u.anna!.id, collectionId: regular.id, type: 'NEW_OBLIGATION',
      handshakePath: [u.david!.id, u.anna!.id], status: 'READ', expiresAt: inDays(20), createdAt: ago(4),
    },
  });

  // A finished collection, for history screens
  const closed = await db.collection.create({
    data: {
      creatorId: u.oleg!.id, type: 'EMERGENCY', amount: 150, chatLink: 'https://t.me/+test_oleg_done',
      status: 'CLOSED', blockedAt: ago(18), closedAt: ago(15), createdAt: ago(20),
    },
  });
  for (const [key, amount] of [['anna', 50], ['david', 60], ['sara', 40]] as const) {
    await db.obligation.create({ data: { collectionId: closed.id, userId: u[key]!.id, amount, createdAt: ago(19) } });
  }

  const big = await seedBigNetwork();

  console.log(`seed-dev: ${PEOPLE.length} users, ${EDGES.length} connections, 3 collections.`);
  console.log(`seed-dev: big@test.local — ${big.people} people in the network (${big.l1}/${big.l2}/${big.l3} by level), ${big.edges} connections.`);
  console.log('Sign in as anna@test.local (active), big@test.local (large network) or new@test.local (empty circle).');
}

/**
 * A separate cluster (not linked to Anna's) around big@test.local, about 250 people deep in three levels,
 * for screens that only show their problems on a large network (3D graph, long lists, level grouping).
 * A fixed-seed generator keeps the same names and links on every run.
 */
async function seedBigNetwork() {
  let state = 20261109;
  const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]!;

  const FIRST = ['Alex', 'Bella', 'Carlos', 'Dana', 'Emil', 'Fatima', 'Georg', 'Hana', 'Ilya', 'Jasmin', 'Kenji', 'Lea',
    'Marek', 'Nora', 'Omar', 'Petra', 'Quinn', 'Rosa', 'Stefan', 'Tara', 'Umar', 'Vera', 'Wim', 'Xenia', 'Yara', 'Zoran',
    'Aiko', 'Boris', 'Clara', 'Diego', 'Elif', 'Felix', 'Greta', 'Hugo', 'Ines', 'Jonas', 'Kira', 'Luca', 'Mila', 'Nils'];
  const LAST = ['Adler', 'Brandt', 'Costa', 'Dumont', 'Eriksen', 'Fischer', 'Garcia', 'Huang', 'Ivanova', 'Jensen', 'Kim',
    'Lopez', 'Moreau', 'Nakamura', 'Okafor', 'Park', 'Quist', 'Rahman', 'Silva', 'Tran', 'Ueda', 'Varga', 'Wong', 'Yilmaz',
    'Zielinski', 'Bauer', 'Chopra', 'Dvorak', 'Haas', 'Lindqvist'];
  const CITIES = ['Taipei', 'Berlin', 'Lisbon', 'Warsaw', 'Tokyo', 'Toronto', 'Tbilisi', 'Prague', undefined, undefined];
  const BUDGETS = [0, 5, 10, 10, 15, 20, 25, 30, 50, 100];

  // Shape: 36 direct connections, each with 3 of their own (108), most of those with one more (~100)
  const L1 = 36;
  type Node = { key: string; level: 1 | 2 | 3; parent: string };
  const nodes: Node[] = [];
  for (let i = 0; i < L1; i++) nodes.push({ key: `bnet-1-${i}`, level: 1, parent: 'big' });
  for (const p of nodes.filter((n) => n.level === 1)) {
    for (let j = 0; j < 3; j++) nodes.push({ key: `${p.key}-${j}`.replace('bnet-1', 'bnet-2'), level: 2, parent: p.key });
  }
  for (const p of nodes.filter((n) => n.level === 2)) {
    if (rnd() < 0.93) nodes.push({ key: p.key.replace('bnet-2', 'bnet-3'), level: 3, parent: p.key });
  }

  const owner = await db.user.create({
    data: {
      name: 'Boris Grand', email: 'big@test.local', emailVerifiedAt: ago(200), language: 'ru', city: 'Taipei',
      monthlyBudget: 100, remainingBudget: 100, budgetUpdatedAt: ago(2), onboardingCompleted: true,
      createdAt: ago(200), lastSeen: ago(0), contacts: { create: [{ type: 'telegram', value: 'big_test' }] },
    },
  });

  const created = await db.user.createManyAndReturn({
    data: nodes.map((n, i) => {
      const budget = pick(BUDGETS);
      return {
        name: `${pick(FIRST)} ${pick(LAST)}`,
        email: `${n.key}@test.local`,
        emailVerifiedAt: ago(190 - (i % 180)),
        language: rnd() < 0.3 ? 'ru' : 'en',
        city: pick(CITIES),
        monthlyBudget: budget || null,
        remainingBudget: budget || null,
        budgetUpdatedAt: budget ? ago(1 + (i % 20)) : null,
        onboardingCompleted: true,
        createdAt: ago(190 - (i % 180)),
        lastSeen: ago(i % 30),
      };
    }),
    select: { id: true, email: true },
  });
  const id: Record<string, string> = { big: owner.id };
  for (const c of created) id[c.email!.replace('@test.local', '')] = c.id;

  // Tree links plus some links inside a level, so the graph is not a pure tree
  const pairs = new Set<string>();
  const edges: { userAId: string; userBId: string; createdAt: Date }[] = [];
  const link = (a: string, b: string, days: number) => {
    const [x, y] = [id[a]!, id[b]!].sort();
    const k = `${x}|${y}`;
    if (x === y || pairs.has(k)) return;
    pairs.add(k);
    edges.push({ userAId: x!, userBId: y!, createdAt: ago(days) });
  };
  nodes.forEach((n, i) => link(n.parent, n.key, 180 - (i % 170)));
  const l1 = nodes.filter((n) => n.level === 1);
  const l2 = nodes.filter((n) => n.level === 2);
  for (let i = 0; i < 25; i++) link(pick(l1).key, pick(l1).key, 30 + i);
  for (let i = 0; i < 40; i++) link(pick(l2).key, pick(l2).key, 20 + i);
  await db.connection.createMany({ data: edges });

  // An active request from a direct connection, with pledges from the network
  const author = l1[0]!.key;
  const emergency = await db.collection.create({
    data: {
      creatorId: id[author]!, type: 'EMERGENCY', amount: 800, chatLink: 'https://t.me/+test_big_help',
      status: 'ACTIVE', createdAt: ago(1),
    },
  });
  await db.obligation.createMany({
    data: l2.slice(0, 18).map((n, i) => ({ collectionId: emergency.id, userId: id[n.key]!, amount: 10 + (i % 4) * 10, createdAt: ago(0.5) })),
  });
  await db.notification.create({
    data: {
      userId: owner.id, collectionId: emergency.id, type: 'NEW_COLLECTION',
      handshakePath: [id[author]!, owner.id], expiresAt: inDays(1), createdAt: ago(0.1),
    },
  });

  // The owner's own regular collection with subscribers among direct connections
  const regular = await db.collection.create({
    data: {
      creatorId: owner.id, type: 'REGULAR', amount: 500, chatLink: 'https://t.me/+test_big_regular',
      status: 'ACTIVE', currentCycleStart: ago(7), createdAt: ago(7),
    },
  });
  await db.obligation.createMany({
    data: l1.slice(1, 13).map((n, i) => ({
      collectionId: regular.id, userId: id[n.key]!, amount: 10 + (i % 3) * 5, isSubscription: true, createdAt: ago(6),
    })),
  });

  return {
    people: nodes.length,
    l1: l1.length,
    l2: l2.length,
    l3: nodes.filter((n) => n.level === 3).length,
    edges: edges.length,
  };
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => db.$disconnect());
