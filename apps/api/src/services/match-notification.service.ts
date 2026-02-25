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
interface MatchMsgSet {
  youCanHelp: (name: string, skill: string) => string;
  theyCanHelp: (name: string, skill: string) => string;
  writeBtn: string;
  profileBtn: string;
}

function m(youHelp: string, theyHelp: string, write: string, profile: string): MatchMsgSet {
  return {
    youCanHelp: (name, skill) => `🎯 <b>${youHelp.split('|')[0]}</b>\n\n${youHelp.split('|')[1]?.replace('{n}', `<b>${name}</b>`).replace('{s}', `<b>${skill}</b>`)}\n\n${youHelp.split('|')[2]}`,
    theyCanHelp: (name, skill) => `🎯 <b>${theyHelp.split('|')[0]}</b>\n\n${theyHelp.split('|')[1]?.replace('{n}', `<b>${name}</b>`).replace('{s}', `<b>${skill}</b>`)}\n\n${theyHelp.split('|')[2]}`,
    writeBtn: write,
    profileBtn: profile,
  };
}

const MATCH_MSG: Record<string, MatchMsgSet> = {
  ru: m(
    'Совпадение!|Ты можешь помочь {n} с навыком: {s}|Напиши — обсудите как вы можете помочь друг другу.',
    'Совпадение!|{n} может помочь тебе с навыком: {s}|Напиши — обсудите как вы можете помочь друг другу.',
    'Написать', 'Открыть профиль',
  ),
  en: m(
    'Match found!|You can help {n} with: {s}|Reach out to discuss how you can help each other.',
    'Match found!|{n} can help you with: {s}|Reach out to discuss how you can help each other.',
    'Write', 'Open profile',
  ),
  uk: m(
    'Збіг!|Ти можеш допомогти {n} з навичкою: {s}|Напиши — обговоріть як ви можете допомогти одне одному.',
    'Збіг!|{n} може допомогти тобі з навичкою: {s}|Напиши — обговоріть як ви можете допомогти одне одному.',
    'Написати', 'Відкрити профіль',
  ),
  be: m(
    'Супадзенне!|Ты можаш дапамагчы {n} з навыкам: {s}|Напішы — абмяркуйце як вы можаце дапамагчы адзін аднаму.',
    'Супадзенне!|{n} можа дапамагчы табе з навыкам: {s}|Напішы — абмяркуйце як вы можаце дапамагчы адзін аднаму.',
    'Напісаць', 'Адкрыць профіль',
  ),
  de: m(
    'Übereinstimmung!|Du kannst {n} helfen mit: {s}|Schreib — besprecht, wie ihr einander helfen könnt.',
    'Übereinstimmung!|{n} kann dir helfen mit: {s}|Schreib — besprecht, wie ihr einander helfen könnt.',
    'Schreiben', 'Profil öffnen',
  ),
  fr: m(
    'Correspondance !|Tu peux aider {n} avec : {s}|Écris pour discuter comment vous pouvez vous entraider.',
    'Correspondance !|{n} peut t\'aider avec : {s}|Écris pour discuter comment vous pouvez vous entraider.',
    'Écrire', 'Ouvrir le profil',
  ),
  es: m(
    '¡Coincidencia!|Puedes ayudar a {n} con: {s}|Escribe para discutir cómo pueden ayudarse mutuamente.',
    '¡Coincidencia!|{n} puede ayudarte con: {s}|Escribe para discutir cómo pueden ayudarse mutuamente.',
    'Escribir', 'Abrir perfil',
  ),
  pt: m(
    'Correspondência!|Você pode ajudar {n} com: {s}|Escreva para discutir como podem se ajudar.',
    'Correspondência!|{n} pode te ajudar com: {s}|Escreva para discutir como podem se ajudar.',
    'Escrever', 'Abrir perfil',
  ),
  it: m(
    'Corrispondenza!|Puoi aiutare {n} con: {s}|Scrivi per discutere come potete aiutarvi.',
    'Corrispondenza!|{n} può aiutarti con: {s}|Scrivi per discutere come potete aiutarvi.',
    'Scrivi', 'Apri profilo',
  ),
  nl: m(
    'Match gevonden!|Je kunt {n} helpen met: {s}|Schrijf om te bespreken hoe jullie elkaar kunnen helpen.',
    'Match gevonden!|{n} kan je helpen met: {s}|Schrijf om te bespreken hoe jullie elkaar kunnen helpen.',
    'Schrijven', 'Profiel openen',
  ),
  pl: m(
    'Dopasowanie!|Możesz pomóc {n} w: {s}|Napisz — omówcie jak możecie sobie pomóc.',
    'Dopasowanie!|{n} może ci pomóc w: {s}|Napisz — omówcie jak możecie sobie pomóc.',
    'Napisz', 'Otwórz profil',
  ),
  cs: m(
    'Shoda!|Můžeš pomoci {n} s: {s}|Napiš — domluvte se, jak si můžete pomoci.',
    'Shoda!|{n} ti může pomoci s: {s}|Napiš — domluvte se, jak si můžete pomoci.',
    'Napsat', 'Otevřít profil',
  ),
  ro: m(
    'Potrivire!|Poți ajuta pe {n} cu: {s}|Scrie pentru a discuta cum vă puteți ajuta reciproc.',
    'Potrivire!|{n} te poate ajuta cu: {s}|Scrie pentru a discuta cum vă puteți ajuta reciproc.',
    'Scrie', 'Deschide profil',
  ),
  sr: m(
    'Подударање!|Можеш помоћи {n} са: {s}|Напиши — договорите како можете помоћи једно другом.',
    'Подударање!|{n} може да ти помогне са: {s}|Напиши — договорите како можете помоћи једно другом.',
    'Напиши', 'Отвори профил',
  ),
  sv: m(
    'Matchning!|Du kan hjälpa {n} med: {s}|Skriv för att diskutera hur ni kan hjälpa varandra.',
    'Matchning!|{n} kan hjälpa dig med: {s}|Skriv för att diskutera hur ni kan hjälpa varandra.',
    'Skriv', 'Öppna profil',
  ),
  da: m(
    'Match fundet!|Du kan hjælpe {n} med: {s}|Skriv for at diskutere, hvordan I kan hjælpe hinanden.',
    'Match fundet!|{n} kan hjælpe dig med: {s}|Skriv for at diskutere, hvordan I kan hjælpe hinanden.',
    'Skriv', 'Åbn profil',
  ),
  no: m(
    'Treff!|Du kan hjelpe {n} med: {s}|Skriv for å diskutere hvordan dere kan hjelpe hverandre.',
    'Treff!|{n} kan hjelpe deg med: {s}|Skriv for å diskutere hvordan dere kan hjelpe hverandre.',
    'Skriv', 'Åpne profil',
  ),
  fi: m(
    'Osuma!|Voit auttaa käyttäjää {n} taidossa: {s}|Kirjoita — keskustelkaa miten voitte auttaa toisianne.',
    'Osuma!|{n} voi auttaa sinua taidossa: {s}|Kirjoita — keskustelkaa miten voitte auttaa toisianne.',
    'Kirjoita', 'Avaa profiili',
  ),
  tr: m(
    'Eşleşme!|{n} kişisine yardım edebilirsin: {s}|Yaz — birbirinize nasıl yardım edebileceğinizi konuşun.',
    'Eşleşme!|{n} sana yardım edebilir: {s}|Yaz — birbirinize nasıl yardım edebileceğinizi konuşun.',
    'Yaz', 'Profili aç',
  ),
  ar: m(
    'تطابق!|يمكنك مساعدة {n} في: {s}|اكتب لمناقشة كيف يمكنكم مساعدة بعضكم البعض.',
    'تطابق!|{n} يمكنه مساعدتك في: {s}|اكتب لمناقشة كيف يمكنكم مساعدة بعضكم البعض.',
    'اكتب', 'فتح الملف الشخصي',
  ),
  he: m(
    'התאמה!|אתה יכול לעזור ל{n} עם: {s}|כתוב כדי לדון איך תוכלו לעזור אחד לשני.',
    'התאמה!|{n} יכול לעזור לך עם: {s}|כתוב כדי לדון איך תוכלו לעזור אחד לשני.',
    'כתוב', 'פתח פרופיל',
  ),
  hi: m(
    'मिलान!|आप {n} की मदद कर सकते हैं: {s}|लिखें — चर्चा करें कि आप एक-दूसरे की कैसे मदद कर सकते हैं।',
    'मिलान!|{n} आपकी मदद कर सकते हैं: {s}|लिखें — चर्चा करें कि आप एक-दूसरे की कैसे मदद कर सकते हैं।',
    'लिखें', 'प्रोफ़ाइल खोलें',
  ),
  ja: m(
    'マッチ!|{n}さんを手伝えます: {s}|書いて — お互いにどう助け合えるか話し合いましょう。',
    'マッチ!|{n}さんがあなたを手伝えます: {s}|書いて — お互いにどう助け合えるか話し合いましょう。',
    '書く', 'プロフィールを開く',
  ),
  ko: m(
    '매칭!|{n}님을 도울 수 있습니다: {s}|서로 어떻게 도울 수 있는지 이야기해 보세요.',
    '매칭!|{n}님이 도와줄 수 있습니다: {s}|서로 어떻게 도울 수 있는지 이야기해 보세요.',
    '쓰기', '프로필 열기',
  ),
  zh: m(
    '匹配!|你可以帮助{n}: {s}|写信讨论如何互相帮助。',
    '匹配!|{n}可以帮助你: {s}|写信讨论如何互相帮助。',
    '写信', '打开资料',
  ),
  th: m(
    'จับคู่สำเร็จ!|คุณสามารถช่วย {n} เรื่อง: {s}|เขียนเพื่อหารือว่าจะช่วยเหลือกันได้อย่างไร',
    'จับคู่สำเร็จ!|{n} สามารถช่วยคุณเรื่อง: {s}|เขียนเพื่อหารือว่าจะช่วยเหลือกันได้อย่างไร',
    'เขียน', 'เปิดโปรไฟล์',
  ),
  vi: m(
    'Kết hợp!|Bạn có thể giúp {n} về: {s}|Viết để thảo luận cách giúp đỡ lẫn nhau.',
    'Kết hợp!|{n} có thể giúp bạn về: {s}|Viết để thảo luận cách giúp đỡ lẫn nhau.',
    'Viết', 'Mở hồ sơ',
  ),
  id: m(
    'Kecocokan!|Kamu bisa membantu {n} dengan: {s}|Tulis untuk mendiskusikan bagaimana bisa saling membantu.',
    'Kecocokan!|{n} bisa membantumu dengan: {s}|Tulis untuk mendiskusikan bagaimana bisa saling membantu.',
    'Tulis', 'Buka profil',
  ),
};

function getMsg(lang: string): MatchMsgSet {
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

  // Find users in network who NEED these categories
  const matches = await db.$queryRaw<Array<MatchInfo>>`
    WITH RECURSIVE network AS (
      SELECT ${skillOwnerId}::text AS uid
      UNION
      SELECT CASE WHEN c."userAId" = n.uid THEN c."userBId" ELSE c."userAId" END
      FROM connections c
      JOIN network n ON c."userAId" = n.uid OR c."userBId" = n.uid
    )
    SELECT un."userId", un."categoryId"
    FROM user_needs un
    WHERE un."categoryId" = ANY(${addedCategoryIds})
      AND un."userId" != ${skillOwnerId}
      AND un."userId" IN (SELECT uid FROM network)
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

  // Find users in network who HAVE these skills
  const matches = await db.$queryRaw<Array<MatchInfo>>`
    WITH RECURSIVE network AS (
      SELECT ${needOwnerId}::text AS uid
      UNION
      SELECT CASE WHEN c."userAId" = n.uid THEN c."userBId" ELSE c."userAId" END
      FROM connections c
      JOIN network n ON c."userAId" = n.uid OR c."userBId" = n.uid
    )
    SELECT us."userId" AS "userId", us."categoryId"
    FROM user_skills us
    WHERE us."categoryId" = ANY(${addedCategoryIds})
      AND us."userId" != ${needOwnerId}
      AND us."userId" IN (SELECT uid FROM network)
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

/**
 * Full rescan: find all skill matches for a user and create notifications.
 * Called when a new connection is created (networks may merge).
 */
export async function scanMatchesForUser(db: PrismaClient, userId: string): Promise<void> {
  const skills = await db.userSkill.findMany({ where: { userId }, select: { categoryId: true } });
  const needs = await db.userNeed.findMany({ where: { userId }, select: { categoryId: true } });

  if (skills.length > 0) {
    await createSkillMatchNotifications(db, userId, skills.map((s) => s.categoryId));
  }
  if (needs.length > 0) {
    await createNeedMatchNotifications(db, userId, needs.map((n) => n.categoryId));
  }
}
