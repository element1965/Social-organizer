import { Prisma, type PrismaClient } from '@so/db';
import { sendTelegramMessage, type TgReplyMarkup } from './telegram-bot.service.js';
import { getNetworkUserIds } from './bfs.service.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';
const MAX_CHAIN_LENGTH = 5;

interface Edge {
  from: string; // giver userId (has skill)
  to: string; // receiver userId (needs skill)
  categoryId: string;
}

interface CycleEdge extends Edge {}

/**
 * Build a directed graph: edge A→B if A has a skill that B needs.
 * Uses in-memory BFS for network instead of PostgreSQL recursive CTE.
 */
async function buildGraph(db: PrismaClient, seedUserId: string): Promise<Edge[]> {
  const networkIds = await getNetworkUserIds(db, seedUserId);

  const edges = await db.$queryRaw<Edge[]>`
    SELECT
      us."userId" AS "from",
      un."userId" AS "to",
      us."categoryId" AS "categoryId"
    FROM user_skills us
    JOIN user_needs un ON un."categoryId" = us."categoryId" AND un."userId" != us."userId"
    JOIN skill_categories sc ON sc.id = us."categoryId"
    JOIN users u1 ON u1.id = us."userId" AND u1."deletedAt" IS NULL
    JOIN users u2 ON u2.id = un."userId" AND u2."deletedAt" IS NULL
    WHERE us."userId" = ANY(${networkIds})
      AND un."userId" = ANY(${networkIds})
      AND sc.key NOT LIKE 'other%'
      AND (sc."isOnline" = true
           OR (LOWER(COALESCE(u1.city, '')) = LOWER(COALESCE(u2.city, ''))
               AND COALESCE(u1.city, '') != ''
               AND COALESCE(u1.country_code, '') = COALESCE(u2.country_code, '')
               AND COALESCE(u1.country_code, '') != ''))
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
  const edges = await buildGraph(db, userId);
  if (edges.length === 0) return 0;

  const cycles = findCycles(edges, userId);
  if (cycles.length === 0) return 0;

  // Deduplicate cycles by participant set (keep only 1 per unique set of users)
  const participantSeen = new Set<string>();
  const uniqueCycles: CycleEdge[][] = [];
  for (const cycle of cycles) {
    const participantKey = [...new Set(cycle.map((e) => e.from))].sort().join(',');
    if (participantSeen.has(participantKey)) continue;
    participantSeen.add(participantKey);
    uniqueCycles.push(cycle);
  }

  // Check existing chains to avoid duplicates (by participant set too)
  const existingChains = await db.matchChain.findMany({
    where: { status: { in: ['PROPOSED', 'ACTIVE'] } },
    include: { links: { orderBy: { position: 'asc' } } },
  });

  const existingKeys = new Set(
    existingChains.map((ch) =>
      ch.links.map((l) => `${l.giverId}:${l.categoryId}`).join('|'),
    ),
  );
  const existingParticipantKeys = new Set(
    existingChains.map((ch) =>
      [...new Set(ch.links.flatMap((l) => [l.giverId, l.receiverId]))].sort().join(','),
    ),
  );

  let created = 0;
  const MAX_NEW_CHAINS = 3;
  const newCycles: CycleEdge[][] = [];

  for (const cycle of uniqueCycles) {
    if (created >= MAX_NEW_CHAINS) break;

    const key = normalizeCycleKey(cycle);
    if (existingKeys.has(key)) continue;

    const participantKey = [...new Set(cycle.map((e) => e.from))].sort().join(',');
    if (existingParticipantKeys.has(participantKey)) continue;

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
    existingParticipantKeys.add(participantKey);
    newCycles.push(cycle);
    created++;
  }

  if (created > 0) {
    console.log(`[ChainFinder] Found ${created} new chains involving user ${userId}`);
    // Send TG notifications asynchronously
    notifyChainParticipants(db, newCycles).catch((err) =>
      console.error('[ChainFinder TG] Error:', err),
    );
  }

  return created;
}

// TG notification messages
const CHAIN_MSG: Record<string, {
  pair: (otherName: string, youGive: string, youGet: string) => string;
  chain: (youGive: string, receiverName: string, youGet: string, giverName: string, chainDesc: string) => string;
  youHelpBtn: string;
  helpsYouBtn: string;
  openBtn: string;
}> = {
  ru: {
    pair: (name, give, get) =>
      `🔄 <b>Взаимозачёт найден!</b>\n\nТы и <b>${name}</b> можете помочь друг другу:\n• Ты даёшь: <b>${give}</b>\n• Ты получаешь: <b>${get}</b>\n\nНапишите друг другу и договоритесь о деталях!`,
    chain: (youGive, receiver, youGet, giver, desc) =>
      `🔄 <b>Цепочка взаимозачёта найдена!</b>\n\n` +
      `👉 Ты помогаешь <b>${receiver}</b> с: <b>${youGive}</b>\n` +
      `👈 <b>${giver}</b> помогает тебе с: <b>${youGet}</b>\n\n` +
      `Вся цепочка:\n${desc}\n\n` +
      `Напиши этим двум людям — договоритесь о деталях!`,
    youHelpBtn: 'Ты помогаешь',
    helpsYouBtn: 'Помогает тебе',
    openBtn: 'Открыть совпадения',
  },
  en: {
    pair: (name, give, get) =>
      `🔄 <b>Clearing match found!</b>\n\nYou and <b>${name}</b> can help each other:\n• You give: <b>${give}</b>\n• You get: <b>${get}</b>\n\nReach out and discuss the details!`,
    chain: (youGive, receiver, youGet, giver, desc) =>
      `🔄 <b>Clearing chain found!</b>\n\n` +
      `👉 You help <b>${receiver}</b> with: <b>${youGive}</b>\n` +
      `👈 <b>${giver}</b> helps you with: <b>${youGet}</b>\n\n` +
      `Full chain:\n${desc}\n\n` +
      `Write to these two people to discuss details!`,
    youHelpBtn: 'You help',
    helpsYouBtn: 'Helps you',
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
      // Chain of 3+: notify each participant with exactly 2 contacts
      for (let i = 0; i < cycle.length; i++) {
        const participantId = cycle[i]!.from; // this person is the giver in edge i
        const user = userMap.get(participantId);
        if (!user?.tgId) continue;

        const msg = (CHAIN_MSG[user.lang] || CHAIN_MSG.en!);

        // Who does this participant help? (receiver of edge i)
        const receiverId = cycle[i]!.to;
        const receiver = userMap.get(receiverId);
        const youGiveCat = catMap.get(cycle[i]!.categoryId) || '?';

        // Who helps this participant? Find edge where receiver = participantId
        const incomingEdge = cycle.find((e) => e.to === participantId)!;
        const giverId = incomingEdge.from;
        const giverUser = userMap.get(giverId);
        const youGetCat = catMap.get(incomingEdge.categoryId) || '?';

        // Build full chain description
        const lines: string[] = [];
        for (let j = 0; j < cycle.length; j++) {
          const edge = cycle[j]!;
          const g = userMap.get(edge.from);
          const r = userMap.get(edge.to);
          const cat = catMap.get(edge.categoryId) || '?';
          const gName = edge.from === participantId ? (user.lang === 'ru' ? 'Ты' : 'You') : (g?.name || '?');
          const rName = edge.to === participantId ? (user.lang === 'ru' ? 'тебе' : 'you') : (r?.name || '?');
          lines.push(`${j + 1}. <b>${gName}</b> → ${rName}: <b>${cat}</b>`);
        }

        const text = msg.chain(
          youGiveCat,
          receiver?.name || '?',
          youGetCat,
          giverUser?.name || '?',
          lines.join('\n'),
        );

        // Exactly 2 buttons: who you help + who helps you
        const buttons: TgReplyMarkup['inline_keyboard'] = [];
        const contactRow: TgReplyMarkup['inline_keyboard'][0] = [];
        if (receiver?.tgId) {
          contactRow.push({ text: `👉 ${msg.youHelpBtn}: ${receiver.name}`, url: `tg://user?id=${receiver.tgId}` });
        }
        if (giverUser?.tgId) {
          contactRow.push({ text: `👈 ${msg.helpsYouBtn}: ${giverUser.name}`, url: `tg://user?id=${giverUser.tgId}` });
        }
        if (contactRow.length > 0) buttons.push(contactRow);
        buttons.push([{ text: `📱 ${msg.openBtn}`, web_app: { url: `${WEB_APP_URL}/matches` } }]);

        sendTelegramMessage(user.tgId, text, { inline_keyboard: buttons }).catch(() => {});
      }
    }
  }
}

/**
 * Try to find a replacement for a declined participant in a chain.
 * The declined user appears as receiver in one link and giver in another.
 * We look for someone who:
 *  - needs the same skill (to replace as receiver)
 *  - has the same skill (to replace as giver)
 *  - is connected to both neighbors
 *  - is not already in the chain
 *
 * If found: updates links, resets confirmations, sets chain back to PROPOSED.
 * Returns the replacement userId or null.
 */
export async function tryFindReplacement(
  db: PrismaClient,
  chainId: string,
  declinedUserId: string,
): Promise<string | null> {
  const chain = await db.matchChain.findUnique({
    where: { id: chainId },
    include: { links: { orderBy: { position: 'asc' } } },
  });
  if (!chain) return null;

  // Find the two links involving the declined user
  const asReceiverLink = chain.links.find((l) => l.receiverId === declinedUserId);
  const asGiverLink = chain.links.find((l) => l.giverId === declinedUserId);
  if (!asReceiverLink || !asGiverLink) return null;

  const predecessorId = asReceiverLink.giverId; // gives to the declined person
  const needsCategoryId = asReceiverLink.categoryId; // replacement must need this
  const hasCategoryId = asGiverLink.categoryId; // replacement must have this

  // All current participant IDs (to exclude)
  const participantIds = [...new Set(chain.links.flatMap((l) => [l.giverId, l.receiverId]))];

  // Search for a replacement user
  let replacements: { id: string }[];

  // Find replacement in the whole network — no need for direct connections
  const networkIds = await getNetworkUserIds(db, predecessorId);
  replacements = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM users u
    JOIN user_needs un ON un."userId" = u.id AND un."categoryId" = ${needsCategoryId}
    JOIN user_skills us ON us."userId" = u.id AND us."categoryId" = ${hasCategoryId}
    WHERE u."deletedAt" IS NULL
      AND u.id NOT IN (${Prisma.join(participantIds)})
      AND u.id = ANY(${networkIds})
    LIMIT 1
  `;

  if (replacements.length === 0) return null;

  const newUserId = replacements[0]!.id;

  // Swap the declined user out, reset confirmations on affected links
  await db.$transaction([
    db.matchChainLink.update({
      where: { id: asReceiverLink.id },
      data: {
        receiverId: newUserId,
        receiverConfirmed: false,
        receiverCompleted: false,
      },
    }),
    db.matchChainLink.update({
      where: { id: asGiverLink.id },
      data: {
        giverId: newUserId,
        giverConfirmed: false,
        giverCompleted: false,
        offerHours: null,
        offerDescription: null,
      },
    }),
    db.matchChain.update({
      where: { id: chainId },
      data: { status: 'PROPOSED' },
    }),
  ]);

  console.log(`[ChainFinder] Replaced ${declinedUserId} with ${newUserId} in chain ${chainId}`);
  return newUserId;
}
