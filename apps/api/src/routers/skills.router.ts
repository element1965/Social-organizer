import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { isAdmin } from '../admin.js';
import { createSkillMatchNotifications, createNeedMatchNotifications, scanMatchesForUser } from '../services/match-notification.service.js';
import { findAndStoreChains } from '../services/chain-finder.service.js';
import { translateText } from '../services/translate.service.js';
import type { PrismaClient } from '@so/db';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../../../../packages/i18n/locales');

const LOCALE_LANGS = [
  'en', 'ru', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko',
  'ar', 'hi', 'tr', 'pl', 'uk', 'nl', 'sv', 'da', 'fi', 'no',
  'cs', 'ro', 'th', 'vi', 'id', 'sr', 'he', 'be',
];

/** Translate a skill name to all locales, write to JSON files AND save to DB */
async function translateAndWriteSkillKey(db: PrismaClient, categoryId: string, key: string, originalText: string, sourceLang: string): Promise<number> {
  const targetLangs = LOCALE_LANGS.filter((l) => l !== sourceLang);
  const translations: Record<string, string> = { [sourceLang]: originalText };
  let written = 0;

  // First, write the source language
  writeSkillToLocale(sourceLang, key, originalText);
  written++;

  // Translate in batches of 5
  const BATCH = 5;
  for (let i = 0; i < targetLangs.length; i += BATCH) {
    const batch = targetLangs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (toLang) => {
        const translated = await translateText(originalText, sourceLang, toLang);
        writeSkillToLocale(toLang, key, translated);
        translations[toLang] = translated;
        return toLang;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') written++;
      else console.error('[SkillTranslate] Failed:', r.reason);
    }
  }

  // Save translations to DB (persistent, survives redeploy)
  try {
    await db.skillCategory.update({
      where: { id: categoryId },
      data: { translations },
    });
    console.log(`[SkillTranslate] Saved ${Object.keys(translations).length} translations to DB for "${key}"`);
  } catch (err) {
    console.error('[SkillTranslate] Failed to save translations to DB:', err);
  }

  return written;
}

function writeSkillToLocale(lang: string, key: string, value: string): void {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);
  try {
    if (!fs.existsSync(filePath)) return;
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!content.skills) content.skills = {};
    content.skills[key] = value;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
  } catch (err) {
    console.error(`[SkillTranslate] Failed to write ${lang}.json:`, err);
  }
}

/** Transliterate text to a camelCase key suitable for i18n */
function textToKey(text: string): string {
  const CYR: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',
    л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',
    ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
    є:'ye',і:'i',ї:'yi',ґ:'g',
  };
  const latin = text.toLowerCase().split('').map((c) => CYR[c] ?? c).join('');
  // Split into words on non-alpha chars, filter empty
  const words = latin.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'custom' + Date.now();
  // camelCase
  return words[0] + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

async function autoSuggestOther(
  db: PrismaClient,
  userId: string,
  items: Array<{ categoryId: string; note?: string }>,
  type: 'SKILL' | 'NEED',
) {
  // Load "other*" category IDs
  const otherCats = await db.skillCategory.findMany({
    where: { key: { startsWith: 'other' } },
    select: { id: true, group: true },
  });
  const otherMap = new Map(otherCats.map((c) => [c.id, c.group]));

  for (const item of items) {
    const group = otherMap.get(item.categoryId);
    if (!group || !item.note?.trim()) continue;
    const text = item.note.trim();
    // Skip if already suggested same text by same user
    const existing = await db.suggestedCategory.findFirst({
      where: { userId, group, text: { equals: text, mode: 'insensitive' } },
    });
    if (existing) continue;
    await db.suggestedCategory.create({
      data: { userId, group, text, type },
    });
    console.log(`[Skills] New suggestion (${type}): "${text}" in group "${group}" by ${userId}`);
  }
}

export const skillsRouter = router({
  categories: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.skillCategory.findMany({
      orderBy: [{ group: 'asc' }, { sortOrder: 'asc' }],
    });
  }),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const [skills, needs, user] = await Promise.all([
      ctx.db.userSkill.findMany({
        where: { userId: ctx.userId },
        include: { category: true },
      }),
      ctx.db.userNeed.findMany({
        where: { userId: ctx.userId },
        include: { category: true },
      }),
      ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { skillsCompleted: true },
      }),
    ]);
    return { skills, needs, skillsCompleted: user?.skillsCompleted ?? false };
  }),

  forUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [skills, needs] = await Promise.all([
        ctx.db.userSkill.findMany({
          where: { userId: input.userId },
          include: { category: true },
        }),
        ctx.db.userNeed.findMany({
          where: { userId: input.userId },
          include: { category: true },
        }),
      ]);
      return { skills, needs };
    }),

  saveSkills: protectedProcedure
    .input(z.object({
      skills: z.array(z.object({
        categoryId: z.string(),
        note: z.string().max(200).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const oldSkills = await ctx.db.userSkill.findMany({
        where: { userId: ctx.userId },
        select: { categoryId: true },
      });
      const oldIds = new Set(oldSkills.map((s) => s.categoryId));

      await ctx.db.$transaction([
        ctx.db.userSkill.deleteMany({ where: { userId: ctx.userId } }),
        ...input.skills.map((s) =>
          ctx.db.userSkill.create({
            data: { userId: ctx.userId, categoryId: s.categoryId, note: s.note },
          }),
        ),
      ]);

      const addedIds = input.skills.map((s) => s.categoryId).filter((id) => !oldIds.has(id));
      if (addedIds.length > 0) {
        createSkillMatchNotifications(ctx.db, ctx.userId, addedIds).catch((err) =>
          console.error('[SkillMatch] Error:', err),
        );
      }

      // Auto-suggest "other" categories
      autoSuggestOther(ctx.db, ctx.userId, input.skills, 'SKILL').catch(() => {});

      // Find clearing chains
      findAndStoreChains(ctx.db, ctx.userId).catch((err) =>
        console.error('[ChainFinder] Error:', err),
      );

      return { success: true };
    }),

  saveNeeds: protectedProcedure
    .input(z.object({
      needs: z.array(z.object({
        categoryId: z.string(),
        note: z.string().max(200).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const oldNeeds = await ctx.db.userNeed.findMany({
        where: { userId: ctx.userId },
        select: { categoryId: true },
      });
      const oldIds = new Set(oldNeeds.map((n) => n.categoryId));

      await ctx.db.$transaction([
        ctx.db.userNeed.deleteMany({ where: { userId: ctx.userId } }),
        ...input.needs.map((n) =>
          ctx.db.userNeed.create({
            data: { userId: ctx.userId, categoryId: n.categoryId, note: n.note },
          }),
        ),
      ]);

      const addedIds = input.needs.map((n) => n.categoryId).filter((id) => !oldIds.has(id));
      if (addedIds.length > 0) {
        createNeedMatchNotifications(ctx.db, ctx.userId, addedIds).catch((err) =>
          console.error('[SkillMatch] Error:', err),
        );
      }

      // Auto-suggest "other" categories
      autoSuggestOther(ctx.db, ctx.userId, input.needs, 'NEED').catch(() => {});

      // Find clearing chains
      findAndStoreChains(ctx.db, ctx.userId).catch((err) =>
        console.error('[ChainFinder] Error:', err),
      );

      return { success: true };
    }),

  markCompleted: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.userId },
      data: { skillsCompleted: true },
    });
    return { success: true };
  }),

  adminStats: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.userId)) return null;

    const [
      totalUsers, skillUserRows, needUserRows,
      topSkills, topNeeds,
      totalSkillEntries, totalNeedEntries,
      usersWithGeo, totalCategories,
      chainCounts, notifCounts, pendingSuggestions,
    ] = await Promise.all([
      ctx.db.user.count({ where: { deletedAt: null } }),
      ctx.db.userSkill.groupBy({ by: ['userId'] }),
      ctx.db.userNeed.groupBy({ by: ['userId'] }),
      ctx.db.userSkill.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: 10,
      }),
      ctx.db.userNeed.groupBy({
        by: ['categoryId'],
        _count: { categoryId: true },
        orderBy: { _count: { categoryId: 'desc' } },
        take: 10,
      }),
      ctx.db.userSkill.count(),
      ctx.db.userNeed.count(),
      ctx.db.user.count({ where: { deletedAt: null, countryCode: { not: null } } }),
      ctx.db.skillCategory.count(),
      // Chain stats
      ctx.db.matchChain.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      // Notification stats
      ctx.db.skillMatchNotification.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      ctx.db.suggestedCategory.count({ where: { status: 'PENDING' } }),
    ]);

    const usersWithSkills = skillUserRows.length;
    const usersWithNeeds = needUserRows.length;
    const avgSkillsPerUser = usersWithSkills > 0 ? Math.round(totalSkillEntries / usersWithSkills * 10) / 10 : 0;
    const avgNeedsPerUser = usersWithNeeds > 0 ? Math.round(totalNeedEntries / usersWithNeeds * 10) / 10 : 0;

    // Match density: count skill→need matches across the entire network
    const matchResult = await ctx.db.$queryRaw<Array<{ matches: number; unique_pairs: number }>>`
      SELECT
        COUNT(DISTINCT (s."userId", n."userId", s."categoryId"))::int AS matches,
        COUNT(DISTINCT LEAST(s."userId", n."userId") || '|' || GREATEST(s."userId", n."userId"))::int AS unique_pairs
      FROM user_skills s
      JOIN user_needs n ON s."categoryId" = n."categoryId" AND s."userId" <> n."userId"
      JOIN users us ON us.id = s."userId" AND us."deletedAt" IS NULL
      JOIN users un ON un.id = n."userId" AND un."deletedAt" IS NULL
    `;

    // Chains with TG chat links
    const chainsWithChat = await ctx.db.matchChain.count({
      where: { telegramChatUrl: { not: null } },
    });

    // Unique participants in chains
    const chainParticipants = await ctx.db.$queryRaw<Array<{ cnt: number }>>`
      SELECT COUNT(DISTINCT u)::int AS cnt FROM (
        SELECT "giverId" AS u FROM match_chain_links
        UNION
        SELECT "receiverId" AS u FROM match_chain_links
      ) sub
    `;

    // Resolve category keys for top lists
    const catIds = [...new Set([
      ...topSkills.map((s) => s.categoryId),
      ...topNeeds.map((n) => n.categoryId),
    ])];
    const cats = catIds.length > 0
      ? await ctx.db.skillCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, key: true } })
      : [];
    const catMap = new Map(cats.map((c) => [c.id, c.key]));

    // Chain status breakdown
    const chainStatusMap: Record<string, number> = {};
    for (const c of chainCounts) {
      chainStatusMap[c.status] = c._count.id;
    }

    // Notification status breakdown
    const notifStatusMap: Record<string, number> = {};
    for (const n of notifCounts) {
      notifStatusMap[n.status] = n._count.id;
    }

    return {
      totalUsers,
      usersWithSkills,
      usersWithNeeds,
      fillRate: totalUsers > 0 ? Math.round(((usersWithSkills + usersWithNeeds) / 2 / totalUsers) * 100) : 0,
      matchDensity: matchResult[0]?.matches ?? 0,
      uniqueMatchPairs: matchResult[0]?.unique_pairs ?? 0,
      totalSkillEntries,
      totalNeedEntries,
      avgSkillsPerUser,
      avgNeedsPerUser,
      usersWithGeo,
      geoRate: totalUsers > 0 ? Math.round((usersWithGeo / totalUsers) * 100) : 0,
      totalCategories,
      pendingSuggestions,
      // Chain metrics
      chainsProposed: chainStatusMap['PROPOSED'] ?? 0,
      chainsActive: chainStatusMap['ACTIVE'] ?? 0,
      chainsCompleted: chainStatusMap['COMPLETED'] ?? 0,
      chainsCancelled: chainStatusMap['CANCELLED'] ?? 0,
      chainsTotal: Object.values(chainStatusMap).reduce((a, b) => a + b, 0),
      chainsWithChat,
      chainParticipants: chainParticipants[0]?.cnt ?? 0,
      // Notification metrics
      notifsUnread: notifStatusMap['UNREAD'] ?? 0,
      notifsRead: notifStatusMap['READ'] ?? 0,
      notifsDismissed: notifStatusMap['DISMISSED'] ?? 0,
      notifsTotal: Object.values(notifStatusMap).reduce((a, b) => a + b, 0),
      topSkills: topSkills.map((s) => ({ key: catMap.get(s.categoryId) ?? s.categoryId, count: s._count.categoryId })),
      topNeeds: topNeeds.map((n) => ({ key: catMap.get(n.categoryId) ?? n.categoryId, count: n._count.categoryId })),
    };
  }),

  matchHints: protectedProcedure.query(async ({ ctx }) => {
    const needs = await ctx.db.userNeed.findMany({
      where: { userId: ctx.userId },
    });
    if (needs.length === 0) return [];

    const categoryIds = needs.map((n) => n.categoryId);
    const results = await ctx.db.$queryRaw<Array<{ category_id: string; key: string; cnt: number }>>`
      SELECT un."categoryId" AS category_id, sc.key, COUNT(DISTINCT us."userId")::int AS cnt
      FROM user_needs un
      JOIN skill_categories sc ON sc.id = un."categoryId"
      JOIN user_skills us ON us."categoryId" = un."categoryId"
      JOIN connections c
        ON (c."userAId" = ${ctx.userId} AND c."userBId" = us."userId")
        OR (c."userBId" = ${ctx.userId} AND c."userAId" = us."userId")
      WHERE un."userId" = ${ctx.userId}
        AND un."categoryId" = ANY(${categoryIds})
      GROUP BY un."categoryId", sc.key
      HAVING COUNT(DISTINCT us."userId") > 0
      ORDER BY cnt DESC
      LIMIT 3
    `;

    return results.map((r) => ({ categoryId: r.category_id, key: r.key, friendsCount: r.cnt }));
  }),

  // ---- Suggested categories (admin moderation) ----

  listSuggestions: protectedProcedure.query(async ({ ctx }) => {
    if (!isAdmin(ctx.userId)) return [];
    return ctx.db.suggestedCategory.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }),

  updateSuggestion: protectedProcedure
    .input(z.object({
      id: z.string(),
      text: z.string().min(1).max(200).optional(),
      group: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.userId)) return null;
      const data: Record<string, string> = {};
      if (input.text) data.text = input.text;
      if (input.group) data.group = input.group;
      return ctx.db.suggestedCategory.update({
        where: { id: input.id },
        data,
      });
    }),

  approveSuggestion: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.userId)) return null;

      const suggestion = await ctx.db.suggestedCategory.findUnique({ where: { id: input.id } });
      if (!suggestion || suggestion.status !== 'PENDING') return null;

      // Auto-generate camelCase key from suggestion text
      let key = textToKey(suggestion.text);
      // Ensure uniqueness
      const existing = await ctx.db.skillCategory.findFirst({ where: { key } });
      if (existing) key = key + Date.now();

      // Find max sortOrder in the group (before the "other" entry at 99)
      const maxSort = await ctx.db.skillCategory.findFirst({
        where: { group: suggestion.group, sortOrder: { lt: 99 } },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      const sortOrder = (maxSort?.sortOrder ?? 0) + 1;

      // Create the new category
      const category = await ctx.db.skillCategory.create({
        data: {
          key,
          group: suggestion.group,
          sortOrder,
          isOnline: false,
        },
      });

      // Mark suggestion as approved
      await ctx.db.suggestedCategory.update({
        where: { id: input.id },
        data: { status: 'APPROVED', categoryId: category.id, reviewedAt: new Date() },
      });

      // Find the "other" category for this group to remove old placeholder binding
      const otherCat = await ctx.db.skillCategory.findFirst({
        where: { group: suggestion.group, key: { startsWith: 'other' } },
        select: { id: true },
      });

      // Auto-assign the new category to the suggesting user as skill or need
      // AND remove the "other" placeholder binding
      if (suggestion.type === 'NEED') {
        await ctx.db.userNeed.upsert({
          where: { userId_categoryId: { userId: suggestion.userId, categoryId: category.id } },
          create: { userId: suggestion.userId, categoryId: category.id },
          update: {},
        });
        if (otherCat) {
          await ctx.db.userNeed.deleteMany({
            where: { userId: suggestion.userId, categoryId: otherCat.id },
          });
        }
      } else {
        await ctx.db.userSkill.upsert({
          where: { userId_categoryId: { userId: suggestion.userId, categoryId: category.id } },
          create: { userId: suggestion.userId, categoryId: category.id },
          update: {},
        });
        if (otherCat) {
          await ctx.db.userSkill.deleteMany({
            where: { userId: suggestion.userId, categoryId: otherCat.id },
          });
        }
      }

      // Also assign for ALL other users who suggested the same text (same group, any type)
      const sameSuggestions = await ctx.db.suggestedCategory.findMany({
        where: {
          id: { not: input.id },
          group: suggestion.group,
          text: { equals: suggestion.text, mode: 'insensitive' },
          status: 'PENDING',
        },
      });
      for (const dup of sameSuggestions) {
        if (dup.type === 'NEED') {
          await ctx.db.userNeed.upsert({
            where: { userId_categoryId: { userId: dup.userId, categoryId: category.id } },
            create: { userId: dup.userId, categoryId: category.id },
            update: {},
          });
          if (otherCat) {
            await ctx.db.userNeed.deleteMany({
              where: { userId: dup.userId, categoryId: otherCat.id },
            });
          }
        } else {
          await ctx.db.userSkill.upsert({
            where: { userId_categoryId: { userId: dup.userId, categoryId: category.id } },
            create: { userId: dup.userId, categoryId: category.id },
            update: {},
          });
          if (otherCat) {
            await ctx.db.userSkill.deleteMany({
              where: { userId: dup.userId, categoryId: otherCat.id },
            });
          }
        }
        // Mark duplicate as approved too
        await ctx.db.suggestedCategory.update({
          where: { id: dup.id },
          data: { status: 'APPROVED', categoryId: category.id, reviewedAt: new Date() },
        });
      }

      // Scan matches for all affected users (fire-and-forget)
      const affectedUserIds = new Set([suggestion.userId, ...sameSuggestions.map((s) => s.userId)]);
      for (const uid of affectedUserIds) {
        scanMatchesForUser(ctx.db, uid).catch(() => {});
        findAndStoreChains(ctx.db, uid).catch(() => {});
      }

      // Translate to all 28 locales: write to JSON files + save to DB (async, don't block)
      translateAndWriteSkillKey(ctx.db, category.id, key, suggestion.text, 'ru').then((count) => {
        console.log(`[SkillTranslate] Wrote "${key}" to ${count} locale files + DB`);
      }).catch((err) => {
        console.error('[SkillTranslate] Error:', err);
      });

      return category;
    }),

  rejectSuggestion: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAdmin(ctx.userId)) return null;
      return ctx.db.suggestedCategory.update({
        where: { id: input.id },
        data: { status: 'REJECTED', reviewedAt: new Date() },
      });
    }),
});
