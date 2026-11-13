/**
 * Fills a LOCAL database named so_scale_check with a synthetic network for load measurements:
 * people, a small-world handshake graph (about 13 connections each), Telegram accounts for most,
 * Needs with their notifications and deliveries, and waiting requests. Used by scripts/check-scale.ts.
 *
 * Usage (from apps/api), after creating the database and pushing the schema to it:
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/so_scale_check?schema=public npx tsx scripts/seed-scale.ts [people]
 *
 * The database is emptied first. The script refuses any other database name or host.
 */
import { getDb } from '@so/db';

const url = process.env.DATABASE_URL || '';
const dbName = (url.match(/\/([^/?]+)(\?|$)/) ?? [])[1];
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || dbName !== 'so_scale_check') {
  console.error('Refusing to run: DATABASE_URL must be the local database so_scale_check.');
  process.exit(1);
}

const N = Math.max(1000, Math.min(2_000_000, Number(process.argv[2]) || 100_000));
const NEEDS = Math.round(N / 50);
const db = getDb();
const run = async (label: string, sql: string) => {
  const startedAt = Date.now();
  const rows = await db.$executeRawUnsafe(sql);
  console.log(`${label}: ${rows} rows, ${Date.now() - startedAt} ms`);
};
const uid = (expr: string) => `'c' || lpad((${expr})::text, 24, '0')`;

try {
  await db.$executeRawUnsafe(
    'TRUNCATE notification_deliveries, notifications, obligations, collections, pending_connections, connections, platform_accounts, users CASCADE',
  );

  await run('people', `
    INSERT INTO users (id, name, "updatedAt", "createdAt", "lastSeen", "monthlyBudget", "remainingBudget")
    SELECT ${uid('i')}, 'Person ' || i, now(), now() - random() * interval '300 days', now() - random() * interval '30 days', b, b
    FROM (SELECT i, CASE WHEN random() < 0.4 THEN 1 + floor(random() * 20) END AS b FROM generate_series(1, ${N}) i) s
  `);

  // Five acquaintances among the 150 people who joined just before, and one or two anywhere earlier:
  // dense neighbourhoods with a few far links, as in a real network
  await run('connections', `
    INSERT INTO connections (id, "userAId", "userBId", "createdAt")
    SELECT 'k' || lpad((row_number() OVER ())::text, 24, '0'), a, b, now() - random() * interval '200 days'
    FROM (
      SELECT DISTINCT LEAST(x, y) AS a, GREATEST(x, y) AS b FROM (
        SELECT ${uid('i')} AS x, ${uid('GREATEST(1, i - 1 - floor(random() * LEAST(i - 1, 150))::int)')} AS y
        FROM generate_series(2, ${N}) i, generate_series(1, 5) k
        UNION ALL
        SELECT ${uid('i')}, ${uid('1 + floor(random() * (i - 1))::int')}
        FROM generate_series(2, ${N}) i, generate_series(1, 2) k
        WHERE random() < 0.75
      ) p WHERE x <> y
    ) q
  `);

  await run('telegram accounts', `
    INSERT INTO platform_accounts (id, "userId", platform, "platformId", "updatedAt")
    SELECT 'p' || lpad(i::text, 24, '0'), ${uid('i')}, 'TELEGRAM', 'scale-' || i, now()
    FROM generate_series(1, ${N}) i WHERE random() < 0.6
  `);

  await run('needs', `
    INSERT INTO collections (id, "creatorId", type, "chatLink", "updatedAt", amount, "createdAt")
    SELECT 'q' || lpad(i::text, 24, '0'), ${uid(`1 + floor(random() * ${N})::int`)}, 'EMERGENCY', 'https://t.me/scale_check', now(), 300,
           now() - random() * interval '10 days'
    FROM generate_series(1, ${NEEDS}) i
  `);

  // 300 people told about each Need, as a 300 $ Need does
  await db.$executeRawUnsafe(`
    CREATE TEMP TABLE told AS
    SELECT DISTINCT 'q' || lpad(c::text, 24, '0') AS collection_id, ${uid(`1 + floor(random() * ${N})::int`)} AS user_id
    FROM generate_series(1, ${NEEDS}) c, generate_series(1, 300) k
  `);
  await run('notifications', `
    INSERT INTO notifications (id, "userId", "collectionId", type, "expiresAt", "updatedAt", "createdAt", status)
    SELECT 'n' || lpad((row_number() OVER ())::text, 24, '0'), user_id, collection_id, 'NEW_COLLECTION',
           now() + interval '1 day', now(), now() - random() * interval '10 days',
           (CASE WHEN random() < 0.5 THEN 'UNREAD' ELSE 'READ' END)::"NotificationStatus"
    FROM told
  `);
  await run('deliveries', `
    INSERT INTO notification_deliveries (id, "userId", "eventKey", channel, "createdAt")
    SELECT 'd' || lpad((row_number() OVER ())::text, 24, '0'), user_id, 'col:' || collection_id || ':new', 'TELEGRAM',
           now() - random() * interval '10 days'
    FROM told
  `);

  await run('waiting requests', `
    INSERT INTO pending_connections (id, "fromUserId", "toUserId", "createdAt")
    SELECT 'r' || lpad((row_number() OVER ())::text, 24, '0'), a, b, now() - random() * interval '20 days'
    FROM (
      SELECT DISTINCT ${uid(`1 + floor(random() * ${N})::int`)} AS a, ${uid(`1 + floor(random() * ${N})::int`)} AS b
      FROM generate_series(1, ${Math.round(N / 2)}) i
    ) p WHERE a <> b
  `);

  await db.$executeRawUnsafe('ANALYZE');
  const [sizes] = await db.$queryRaw<Array<{ people: bigint; connections: bigint; notifications: bigint }>>`
    SELECT (SELECT COUNT(*) FROM users) AS people, (SELECT COUNT(*) FROM connections) AS connections,
           (SELECT COUNT(*) FROM notifications) AS notifications
  `;
  console.log(`done: ${sizes!.people} people, ${sizes!.connections} connections (${(2 * Number(sizes!.connections) / Number(sizes!.people)).toFixed(1)} each), ${sizes!.notifications} notifications`);
} finally {
  await db.$disconnect();
}
