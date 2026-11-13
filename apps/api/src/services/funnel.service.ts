import type { PrismaClient } from '@so/db';

/**
 * The admin funnel: how people get from an opened invite to an open Need, by the week they signed up,
 * and which way of inviting brings connections. Counts only: no names, no per-person rows.
 *
 * Steps of a weekly cohort (people who signed up that week and still have an account):
 *   signedUp → requested (sent a request or has a connection) → connected (first confirmed connection)
 *   → five (5 direct connections now) → unlocked (the NEED_UNLOCKED milestone).
 * `opened` is not part of the cohort: it is how many guests opened an invite page that week
 * (invite_open_days), so it can be smaller than signedUp when people come without an invite.
 */

export const FUNNEL_WEEKS = 8;

export interface FunnelWeek {
  /** Monday of the week, UTC, YYYY-MM-DD */
  weekStart: string;
  opened: number;
  signedUp: number;
  requested: number;
  connected: number;
  five: number;
  unlocked: number;
}

export interface FunnelSource {
  source: string;
  /** Guests who opened an invite page with this source (link sources only) */
  opened: number;
  requests: number;
  connections: number;
}

export interface FunnelRatio {
  days: number;
  /** People who signed up in the window and have a confirmed connection */
  newcomersConnected: number;
  /** People who signed up before the window and were seen inside it */
  active: number;
  /** newcomersConnected / active, null when nobody was active */
  perActive: number | null;
}

export interface FunnelReport {
  weeks: FunnelWeek[];
  sources: FunnelSource[];
  ratios: FunnelRatio[];
}

function mondayUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export async function funnelReport(db: PrismaClient, now: Date = new Date()): Promise<FunnelReport> {
  const thisWeek = mondayUtc(now);
  const since = new Date(thisWeek.getTime() - (FUNNEL_WEEKS - 1) * 7 * 86_400_000);

  const [cohorts, opens, connBySource, reqBySource, openBySource] = await Promise.all([
    db.$queryRaw<Array<{ week: Date; signed: number; requested: number; connected: number; five: number; unlocked: number }>>`
      SELECT date_trunc('week', u."createdAt") AS week,
        COUNT(*)::int AS signed,
        COUNT(*) FILTER (WHERE cc.n > 0 OR EXISTS (SELECT 1 FROM pending_connections p WHERE p."fromUserId" = u.id))::int AS requested,
        COUNT(*) FILTER (WHERE cc.n > 0 OR EXISTS (
          SELECT 1 FROM user_milestones m WHERE m."userId" = u.id AND m.kind = 'FIRST_CONNECTION'))::int AS connected,
        COUNT(*) FILTER (WHERE cc.n >= 5)::int AS five,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM user_milestones m WHERE m."userId" = u.id AND m.kind = 'NEED_UNLOCKED'))::int AS unlocked
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS n FROM connections c WHERE c."userAId" = u.id OR c."userBId" = u.id
      ) cc ON true
      WHERE u."deletedAt" IS NULL AND u."createdAt" >= ${since}
      GROUP BY 1
    `,
    db.$queryRaw<Array<{ week: Date; n: number }>>`
      SELECT date_trunc('week', day::timestamp) AS week, SUM(count)::int AS n
      FROM invite_open_days WHERE day >= ${since}::date GROUP BY 1
    `,
    db.$queryRaw<Array<{ source: string; n: number }>>`
      SELECT COALESCE(source, 'unknown') AS source, COUNT(*)::int AS n
      FROM connections WHERE "createdAt" >= ${since} GROUP BY 1
    `,
    db.$queryRaw<Array<{ source: string; n: number }>>`
      SELECT COALESCE(source, 'unknown') AS source, COUNT(*)::int AS n
      FROM pending_connections WHERE "createdAt" >= ${since} GROUP BY 1
    `,
    db.$queryRaw<Array<{ source: string; n: number }>>`
      SELECT source, SUM(count)::int AS n FROM invite_open_days WHERE day >= ${since}::date GROUP BY 1
    `,
  ]);

  const cohortByWeek = new Map(cohorts.map((c) => [dayKey(c.week), c]));
  const openByWeek = new Map(opens.map((o) => [dayKey(o.week), o.n]));
  const weeks: FunnelWeek[] = [];
  for (let i = FUNNEL_WEEKS - 1; i >= 0; i--) {
    const weekStart = dayKey(new Date(thisWeek.getTime() - i * 7 * 86_400_000));
    const c = cohortByWeek.get(weekStart);
    weeks.push({
      weekStart,
      opened: openByWeek.get(weekStart) ?? 0,
      signedUp: c?.signed ?? 0,
      requested: c?.requested ?? 0,
      connected: c?.connected ?? 0,
      five: c?.five ?? 0,
      unlocked: c?.unlocked ?? 0,
    });
  }

  const sourceMap = new Map<string, FunnelSource>();
  const entry = (source: string) => {
    let row = sourceMap.get(source);
    if (!row) sourceMap.set(source, (row = { source, opened: 0, requests: 0, connections: 0 }));
    return row;
  };
  for (const r of openBySource) entry(r.source).opened = r.n;
  for (const r of reqBySource) entry(r.source).requests = r.n;
  for (const r of connBySource) entry(r.source).connections = r.n;
  const sources = [...sourceMap.values()].sort((a, b) => b.connections - a.connections || b.requests - a.requests);

  const ratios: FunnelRatio[] = [];
  for (const days of [7, 28]) {
    const from = new Date(now.getTime() - days * 86_400_000);
    const [row] = await db.$queryRaw<Array<{ newcomers: number; active: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM users u
          WHERE u."deletedAt" IS NULL AND u."createdAt" >= ${from}
            AND EXISTS (SELECT 1 FROM connections c WHERE c."userAId" = u.id OR c."userBId" = u.id)) AS newcomers,
        (SELECT COUNT(*)::int FROM users u
          WHERE u."deletedAt" IS NULL AND u."createdAt" < ${from} AND u."lastSeen" >= ${from}) AS active
    `;
    const newcomersConnected = row?.newcomers ?? 0;
    const active = row?.active ?? 0;
    ratios.push({ days, newcomersConnected, active, perActive: active > 0 ? Math.round((newcomersConnected / active) * 100) / 100 : null });
  }

  return { weeks, sources, ratios };
}
