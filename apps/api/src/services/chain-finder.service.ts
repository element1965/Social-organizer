import type { PrismaClient } from '@so/db';
import { sendTelegramMessage, type TgReplyMarkup } from './telegram-bot.service.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';
const MAX_CHAIN_LENGTH = 5;

interface Edge {
  from: string; // giver userId (has skill)
  to: string; // receiver userId (needs skill)
  categoryId: string;
}

interface CycleEdge extends Edge {}

/**
 * Build a directed graph: edge A→B if A has a skill that B needs,
 * and A↔B are connected (1st degree).
 */
async function buildGraph(db: PrismaClient): Promise<Edge[]> {
  const edges = await db.$queryRaw<Edge[]>`
    SELECT
      us."userId" AS "from",
      un."userId" AS "to",
      us."categoryId" AS "categoryId"
    FROM user_skills us
    JOIN user_needs un ON un."categoryId" = us."categoryId" AND un."userId" != us."userId"
    JOIN connections c
      ON (c."userAId" = us."userId" AND c."userBId" = un."userId")
      OR (c."userBId" = us."userId" AND c."userAId" = un."userId")
    JOIN users u1 ON u1.id = us."userId" AND u1."deletedAt" IS NULL
    JOIN users u2 ON u2.id = un."userId" AND u2."deletedAt" IS NULL
  `;
  return edges;
}

/**
 * Normalize a cycle for deduplication:
 * Rotate so the smallest userId is first.
 */
function normalizeCycleKey(cycle: CycleEdge[]): string {
  const userIds = cycle.map((e) => e.from);
  const minId = userIds.reduce((a, b) => (a < b ? a : b));
  const minIdx = userIds.indexOf(minId);
  const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
  return rotated.map((e) => `${e.from}:${e.categoryId}`).join('|');
}

/**
 * DFS to find cycles starting and ending at `start`.
 */
function dfs(
  start: string,
  current: string,
  path: CycleEdge[],
  adj: Map<string, Edge[]>,
  visited: Set<string>,
  cycles: CycleEdge[][],
  seen: Set<string>,
): void {
  if (path.length >= MAX_CHAIN_LENGTH) return;

  const neighbors = adj.get(current) || [];
  for (const edge of neighbors) {
    if (edge.to === start && path.length >= 2) {
      // Found a cycle of length >= 3 (including the closing edge)
      const cycle = [...path, edge];
      const key = normalizeCycleKey(cycle);
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push(cycle);
      }
    } else if (!visited.has(edge.to)) {
      visited.add(edge.to);
      dfs(start, edge.to, [...path, edge], adj, visited, cycles, seen);
      visited.delete(edge.to);
    }
  }
}

/**
 * Find all clearing rings (cycles) in the skill graph.
 * Returns cycles of length 2..MAX_CHAIN_LENGTH.
 *
 * If `throughUserId` is provided, only find cycles that include this user
 * (optimization: don't scan entire graph on every save).
 */
function findCycles(edges: Edge[], throughUserId?: string): CycleEdge[][] {
  const adj = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e);
  }

  const cycles: CycleEdge[][] = [];
  const seen = new Set<string>();

  // Also find direct pairs (length 2): A→B and B→A
  const pairSeen = new Set<string>();
  for (const e of edges) {
    const reverse = edges.find((r) => r.from === e.to && r.to === e.from);
    if (reverse) {
      const pairKey = [e.from, e.to].sort().join('|');
      if (!pairSeen.has(pairKey)) {
        pairSeen.add(pairKey);
        if (!throughUserId || e.from === throughUserId || e.to === throughUserId) {
          cycles.push([e, reverse]);
          seen.add(normalizeCycleKey([e, reverse]));
        }
      }
    }
  }

  // DFS for longer cycles (3+)
  const startNodes = throughUserId ? [throughUserId] : [...adj.keys()];
  for (const start of startNodes) {
    if (!adj.has(start)) continue;
    const visited = new Set<string>([start]);
    dfs(start, start, [], adj, visited, cycles, seen);
  }

  return cycles;
}

/**
 * Run chain finder for a specific user (called when they save skills/needs).
 * Stores new chains in DB and sends TG notifications.
 */
export async function findAndStoreChains(
  db: PrismaClient,
  userId: string,
): Promise<number> {
  const edges = await buildGraph(db);
  if (edges.length === 0) return 0;

  const cycles = findCycles(edges, userId);
  if (cycles.length === 0) return 0;

  // Check existing chains to avoid duplicates
  const existingChains = await db.matchChain.findMany({
    where: { status: { in: ['PROPOSED', 'ACTIVE'] } },
    include: { links: { orderBy: { position: 'asc' } } },
  });

  const existingKeys = new Set(
    existingChains.map((ch) =>
      ch.links.map((l) => `${l.giverId}:${l.categoryId}`).join('|'),
    ),
  );

  let created = 0;

  for (const cycle of cycles) {
    const key = normalizeCycleKey(cycle);
    if (existingKeys.has(key)) continue;

    // Create chain + links in a transaction
    await db.matchChain.create({
      data: {
        length: cycle.length,
        links: {
          create: cycle.map((edge, idx) => ({
            position: idx,
            giverId: edge.from,
            receiverId: edge.to,
            categoryId: edge.categoryId,
          })),
        },
      },
    });
    existingKeys.add(key);
    created++;
  }

  if (created > 0) {
    console.log(`[ChainFinder] Found ${created} new chains involving user ${userId}`);
    // Send TG notifications asynchronously
    notifyChainParticipants(db, cycles.slice(0, created)).catch((err) =>
      console.error('[ChainFinder TG] Error:', err),
    );
  }

  return created;
}

// TG notification messages
const CHAIN_MSG: Record<string, {
  title: string;
  pair: (otherName: string, youGive: string, youGet: string) => string;
  chain: (description: string) => string;
  openBtn: string;
}> = {
  ru: {
    title: '🔄 Взаимозачёт найден!',
    pair: (name, give, get) =>
      `🔄 <b>Взаимозачёт найден!</b>\n\nТы и <b>${name}</b> можете помочь друг другу:\n• Ты даёшь: <b>${give}</b>\n• Ты получаешь: <b>${get}</b>\n\nНапишите друг другу и договоритесь о деталях!`,
    chain: (desc) =>
      `🔄 <b>Цепочка взаимозачёта найдена!</b>\n\n${desc}\n\nКаждый участник помогает следующему. Напишите друг другу!`,
    openBtn: 'Открыть совпадения',
  },
  en: {
    title: '🔄 Clearing match found!',
    pair: (name, give, get) =>
      `🔄 <b>Clearing match found!</b>\n\nYou and <b>${name}</b> can help each other:\n• You give: <b>${give}</b>\n• You get: <b>${get}</b>\n\nReach out and discuss the details!`,
    chain: (desc) =>
      `🔄 <b>Clearing chain found!</b>\n\n${desc}\n\nEach participant helps the next. Reach out to each other!`,
    openBtn: 'Open matches',
  },
};

async function notifyChainParticipants(
  db: PrismaClient,
  cycles: CycleEdge[][],
): Promise<void> {
  // Collect all userIds
  const allUserIds = new Set<string>();
  const allCatIds = new Set<string>();
  for (const cycle of cycles) {
    for (const edge of cycle) {
      allUserIds.add(edge.from);
      allUserIds.add(edge.to);
      allCatIds.add(edge.categoryId);
    }
  }

  // Resolve users and categories
  const users = await db.user.findMany({
    where: { id: { in: [...allUserIds] } },
    select: {
      id: true,
      name: true,
      language: true,
      platformAccounts: {
        where: { platform: 'TELEGRAM' },
        select: { platformId: true },
        take: 1,
      },
    },
  });
  const userMap = new Map(
    users.map((u) => [
      u.id,
      { name: u.name, lang: u.language || 'en', tgId: u.platformAccounts[0]?.platformId ?? null },
    ]),
  );

  const cats = await db.skillCategory.findMany({
    where: { id: { in: [...allCatIds] } },
    select: { id: true, key: true },
  });
  const catMap = new Map(cats.map((c) => [c.id, c.key]));

  for (const cycle of cycles) {
    const participants = cycle.map((e) => e.from);

    if (cycle.length === 2) {
      // Direct pair: A↔B
      const a = userMap.get(cycle[0]!.from);
      const b = userMap.get(cycle[0]!.to);
      if (!a || !b) continue;

      const catA = catMap.get(cycle[0]!.categoryId) || 'unknown';
      const catB = catMap.get(cycle[1]!.categoryId) || 'unknown';

      // Notify A
      if (a.tgId) {
        const msg = (CHAIN_MSG[a.lang] || CHAIN_MSG.en!);
        const text = msg.pair(b.name, catA, catB);
        const markup: TgReplyMarkup = {
          inline_keyboard: [
            [
              ...(b.tgId ? [{ text: `💬 ${b.name}`, url: `tg://user?id=${b.tgId}` }] : []),
              { text: `📱 ${msg.openBtn}`, web_app: { url: `${WEB_APP_URL}/matches` } },
            ],
          ],
        };
        sendTelegramMessage(a.tgId, text, markup).catch(() => {});
      }

      // Notify B
      if (b.tgId) {
        const msg = (CHAIN_MSG[b.lang] || CHAIN_MSG.en!);
        const text = msg.pair(a.name, catB, catA);
        const markup: TgReplyMarkup = {
          inline_keyboard: [
            [
              ...(a.tgId ? [{ text: `💬 ${a.name}`, url: `tg://user?id=${a.tgId}` }] : []),
              { text: `📱 ${msg.openBtn}`, web_app: { url: `${WEB_APP_URL}/matches` } },
            ],
          ],
        };
        sendTelegramMessage(b.tgId, text, markup).catch(() => {});
      }
    } else {
      // Chain of 3+: notify each participant
      for (let i = 0; i < participants.length; i++) {
        const participantId = participants[i]!;
        const user = userMap.get(participantId);
        if (!user?.tgId) continue;

        const msg = (CHAIN_MSG[user.lang] || CHAIN_MSG.en!);

        // Build chain description from this participant's perspective
        const lines: string[] = [];
        for (let j = 0; j < cycle.length; j++) {
          const edge = cycle[j]!;
          const giver = userMap.get(edge.from);
          const receiver = userMap.get(edge.to);
          const cat = catMap.get(edge.categoryId) || '?';
          const giverName = edge.from === participantId ? (user.lang === 'ru' ? 'Ты' : 'You') : (giver?.name || '?');
          const receiverName = edge.to === participantId ? (user.lang === 'ru' ? 'тебе' : 'you') : (receiver?.name || '?');
          lines.push(`${j + 1}. <b>${giverName}</b> → ${receiverName}: <b>${cat}</b>`);
        }

        const text = msg.chain(lines.join('\n'));

        // Buttons: links to all other participants + open matches
        const buttons: TgReplyMarkup['inline_keyboard'] = [];
        const otherRow: TgReplyMarkup['inline_keyboard'][0] = [];
        for (const pid of participants) {
          if (pid === participantId) continue;
          const other = userMap.get(pid);
          if (other?.tgId) {
            otherRow.push({ text: `💬 ${other.name}`, url: `tg://user?id=${other.tgId}` });
          }
        }
        if (otherRow.length > 0) buttons.push(otherRow);
        buttons.push([{ text: `📱 ${msg.openBtn}`, web_app: { url: `${WEB_APP_URL}/matches` } }]);

        sendTelegramMessage(user.tgId, text, { inline_keyboard: buttons }).catch(() => {});
      }
    }
  }
}
