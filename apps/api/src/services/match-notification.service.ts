import type { PrismaClient } from '@so/db';
import { sendTelegramMessage, type TgReplyMarkup } from './telegram-bot.service.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

interface MatchInfo {
  userId: string;
  categoryId: string;
}

/** Resolve TG chatIds and user names for a set of userIds */
async function resolveUsers(db: PrismaClient, userIds: string[]) {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map<string, { name: string; tgChatId: string | null; lang: string }>();

  const users = await db.user.findMany({
    where: { id: { in: unique } },
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

  const map = new Map<string, { name: string; tgChatId: string | null; lang: string }>();
  for (const u of users) {
    map.set(u.id, {
      name: u.name,
      tgChatId: u.platformAccounts[0]?.platformId ?? null,
      lang: u.language || 'en',
    });
  }
  return map;
}

/** Resolve category keys for a set of categoryIds */
async function resolveCategories(db: PrismaClient, categoryIds: string[]) {
  const unique = [...new Set(categoryIds)];
  if (unique.length === 0) return new Map<string, string>();

  const cats = await db.skillCategory.findMany({
    where: { id: { in: unique } },
    select: { id: true, key: true },
  });
  return new Map(cats.map((c) => [c.id, c.key]));
}

// Match notification messages per language
const MATCH_MSG: Record<string, {
  youCanHelp: (name: string, skill: string) => string;
  theyCanHelp: (name: string, skill: string) => string;
  writeBtn: string;
  profileBtn: string;
}> = {
  ru: {
    youCanHelp: (name, skill) => `🎯 <b>Совпадение!</b>\n\nТы можешь помочь <b>${name}</b> с навыком: <b>${skill}</b>\n\nНапиши — обсудите как вы можете помочь друг другу.`,
    theyCanHelp: (name, skill) => `🎯 <b>Совпадение!</b>\n\n<b>${name}</b> может помочь тебе с навыком: <b>${skill}</b>\n\nНапиши — обсудите как вы можете помочь друг другу.`,
    writeBtn: 'Написать',
    profileBtn: 'Открыть профиль',
  },
  en: {
    youCanHelp: (name, skill) => `🎯 <b>Match found!</b>\n\nYou can help <b>${name}</b> with: <b>${skill}</b>\n\nReach out to discuss how you can help each other.`,
    theyCanHelp: (name, skill) => `🎯 <b>Match found!</b>\n\n<b>${name}</b> can help you with: <b>${skill}</b>\n\nReach out to discuss how you can help each other.`,
    writeBtn: 'Write',
    profileBtn: 'Open profile',
  },
};

function getMsg(lang: string) {
  return MATCH_MSG[lang] || MATCH_MSG.en!;
}

/** Send TG notification about a skill match to a user */
async function sendMatchTgNotification(
  recipientChatId: string,
  recipientLang: string,
  matchUserName: string,
  matchUserTgId: string | null,
  matchUserId: string,
  categoryKey: string,
  direction: 'youCanHelp' | 'theyCanHelp',
): Promise<void> {
  const msg = getMsg(recipientLang);
  const text = msg[direction](matchUserName, categoryKey);

  const buttons: TgReplyMarkup['inline_keyboard'] = [];

  // Row 1: Write to matched user (TG deep link) + Open profile in Mini App
  const row: TgReplyMarkup['inline_keyboard'][0] = [];
  if (matchUserTgId) {
    row.push({ text: `💬 ${msg.writeBtn} ${matchUserName}`, url: `tg://user?id=${matchUserTgId}` });
  }
  row.push({ text: `📱 ${msg.profileBtn}`, web_app: { url: `${WEB_APP_URL}/profile/${matchUserId}` } });
  buttons.push(row);

  await sendTelegramMessage(recipientChatId, text, { inline_keyboard: buttons });
}

/**
 * When a user adds new skills, find connected users who need those skills
 * and create SkillMatchNotification records + send TG messages.
 */
export async function createSkillMatchNotifications(
  db: PrismaClient,
  skillOwnerId: string,
  addedCategoryIds: string[],
): Promise<void> {
  if (addedCategoryIds.length === 0) return;

  // Find connected users who NEED these categories
  const matches = await db.$queryRaw<Array<MatchInfo>>`
    SELECT un."userId", un."categoryId"
    FROM user_needs un
    JOIN connections c
      ON (c."userAId" = ${skillOwnerId} AND c."userBId" = un."userId")
      OR (c."userBId" = ${skillOwnerId} AND c."userAId" = un."userId")
    WHERE un."categoryId" = ANY(${addedCategoryIds})
      AND un."userId" != ${skillOwnerId}
  `;

  if (matches.length === 0) return;

  // Batch upsert — skip duplicates
  for (const match of matches) {
    try {
      await db.skillMatchNotification.upsert({
        where: {
          userId_matchUserId_categoryId: {
            userId: match.userId,
            matchUserId: skillOwnerId,
            categoryId: match.categoryId,
          },
        },
        create: {
          userId: match.userId,
          matchUserId: skillOwnerId,
          categoryId: match.categoryId,
        },
        update: { status: 'UNREAD', createdAt: new Date() },
      });
    } catch {
      // skip duplicates
    }
  }

  console.log(`[SkillMatch] Created ${matches.length} notifications for user ${skillOwnerId}`);

  // Send TG notifications
  try {
    const allUserIds = [skillOwnerId, ...matches.map((m) => m.userId)];
    const [users, categories] = await Promise.all([
      resolveUsers(db, allUserIds),
      resolveCategories(db, matches.map((m) => m.categoryId)),
    ]);

    const skillOwner = users.get(skillOwnerId);
    if (!skillOwner) return;

    for (const match of matches) {
      const recipient = users.get(match.userId);
      const catKey = categories.get(match.categoryId) || 'unknown';
      if (!recipient?.tgChatId) continue;

      // Notify the need owner: "skillOwner can help you with X"
      sendMatchTgNotification(
        recipient.tgChatId,
        recipient.lang,
        skillOwner.name,
        skillOwner.tgChatId,
        skillOwnerId,
        catKey,
        'theyCanHelp',
      ).catch((err) => console.error('[SkillMatch TG] Error:', err));

      // Also notify the skill owner: "you can help recipient with X"
      if (skillOwner.tgChatId) {
        sendMatchTgNotification(
          skillOwner.tgChatId,
          skillOwner.lang,
          recipient.name,
          recipient.tgChatId,
          match.userId,
          catKey,
          'youCanHelp',
        ).catch((err) => console.error('[SkillMatch TG] Error:', err));
      }
    }
  } catch (err) {
    console.error('[SkillMatch TG] Failed to send TG notifications:', err);
  }
}

/**
 * When a user adds new needs, find connected users who have those skills
 * and create SkillMatchNotification records + send TG messages.
 */
export async function createNeedMatchNotifications(
  db: PrismaClient,
  needOwnerId: string,
  addedCategoryIds: string[],
): Promise<void> {
  if (addedCategoryIds.length === 0) return;

  // Find connected users who HAVE these skills
  const matches = await db.$queryRaw<Array<MatchInfo>>`
    SELECT us."userId" AS "userId", us."categoryId"
    FROM user_skills us
    JOIN connections c
      ON (c."userAId" = ${needOwnerId} AND c."userBId" = us."userId")
      OR (c."userBId" = ${needOwnerId} AND c."userAId" = us."userId")
    WHERE us."categoryId" = ANY(${addedCategoryIds})
      AND us."userId" != ${needOwnerId}
  `;

  if (matches.length === 0) return;

  // Notify the need owner that someone in their network has the skill
  for (const match of matches) {
    try {
      await db.skillMatchNotification.upsert({
        where: {
          userId_matchUserId_categoryId: {
            userId: needOwnerId,
            matchUserId: match.userId,
            categoryId: match.categoryId,
          },
        },
        create: {
          userId: needOwnerId,
          matchUserId: match.userId,
          categoryId: match.categoryId,
        },
        update: { status: 'UNREAD', createdAt: new Date() },
      });
    } catch {
      // skip duplicates
    }
  }

  console.log(`[SkillMatch] Created ${matches.length} need-match notifications for user ${needOwnerId}`);

  // Send TG notifications
  try {
    const allUserIds = [needOwnerId, ...matches.map((m) => m.userId)];
    const [users, categories] = await Promise.all([
      resolveUsers(db, allUserIds),
      resolveCategories(db, matches.map((m) => m.categoryId)),
    ]);

    const needOwner = users.get(needOwnerId);
    if (!needOwner) return;

    for (const match of matches) {
      const skillOwner = users.get(match.userId);
      const catKey = categories.get(match.categoryId) || 'unknown';

      // Notify the need owner: "skillOwner can help you with X"
      if (needOwner.tgChatId) {
        sendMatchTgNotification(
          needOwner.tgChatId,
          needOwner.lang,
          skillOwner?.name || 'Someone',
          skillOwner?.tgChatId ?? null,
          match.userId,
          catKey,
          'theyCanHelp',
        ).catch((err) => console.error('[SkillMatch TG] Error:', err));
      }

      // Notify the skill owner: "you can help needOwner with X"
      if (skillOwner?.tgChatId) {
        sendMatchTgNotification(
          skillOwner.tgChatId,
          skillOwner.lang,
          needOwner.name,
          needOwner.tgChatId,
          needOwnerId,
          catKey,
          'youCanHelp',
        ).catch((err) => console.error('[SkillMatch TG] Error:', err));
      }
    }
  } catch (err) {
    console.error('[SkillMatch TG] Failed to send TG notifications:', err);
  }
}
