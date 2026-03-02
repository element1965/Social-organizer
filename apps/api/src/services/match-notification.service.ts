import type { PrismaClient } from '@so/db';
import { resources } from '@so/i18n';
import { sendTelegramMessage, type TgReplyMarkup } from './telegram-bot.service.js';
import { sendPushNotification } from './push.service.js';
import { getNetworkUserIds } from './bfs.service.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

interface MatchInfo {
  userId: string;
  categoryId: string;
}

/** Translate a skill key using locale data or DB translations, fallback to en, fallback to raw key */
function translateSkill(lang: string, key: string, dbTranslations?: Record<string, string> | null): string {
  // DB translations first (dynamically added categories)
  if (dbTranslations?.[lang]) return dbTranslations[lang];
  if (dbTranslations?.en) {
    // Try locale file, then DB en fallback
    const locale = (resources as Record<string, { skills?: Record<string, string> }>)[lang]?.skills?.[key];
    if (locale) return locale;
    return dbTranslations.en;
  }
  // Static locale files
  const locale = (resources as Record<string, { skills?: Record<string, string> }>)[lang]?.skills?.[key];
  if (locale) return locale;
  const enFallback = (resources as Record<string, { skills?: Record<string, string> }>).en?.skills?.[key];
  return enFallback || key;
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

/** Resolve category keys + isOnline for a set of categoryIds */
async function resolveCategories(db: PrismaClient, categoryIds: string[]) {
  const unique = [...new Set(categoryIds)];
  if (unique.length === 0) return new Map<string, { key: string; isOnline: boolean; translations: Record<string, string> | null }>();

  const cats = await db.skillCategory.findMany({
    where: { id: { in: unique } },
    select: { id: true, key: true, isOnline: true, translations: true },
  });
  return new Map(cats.map((c) => [c.id, {
    key: c.key,
    isOnline: c.isOnline,
    translations: c.translations as Record<string, string> | null,
  }]));
}

// Match notification messages per language
interface MatchMsgSet {
  youCanHelp: (name: string, skills: string) => string;
  theyCanHelp: (name: string, skills: string) => string;
  writeBtn: string;
  profileBtn: string;
}

function m(youHelp: string, theyHelp: string, write: string, profile: string): MatchMsgSet {
  return {
    youCanHelp: (name, skills) => `🎯 <b>${youHelp.split('|')[0]}</b>\n\n${youHelp.split('|')[1]?.replace('{n}', `<b>${name}</b>`).replace('{s}', `<b>${skills}</b>`)}\n\n${youHelp.split('|')[2]}`,
    theyCanHelp: (name, skills) => `🎯 <b>${theyHelp.split('|')[0]}</b>\n\n${theyHelp.split('|')[1]?.replace('{n}', `<b>${name}</b>`).replace('{s}', `<b>${skills}</b>`)}\n\n${theyHelp.split('|')[2]}`,
    writeBtn: write,
    profileBtn: profile,
  };
}

const MATCH_MSG: Record<string, MatchMsgSet> = {
  ru: m(
    'Совпадение!|Ты можешь помочь {n} — {s}|Напиши — обсудите как вы можете помочь друг другу.',
    'Совпадение!|{n} может помочь тебе — {s}|Напиши — обсудите как вы можете помочь друг другу.',
    'Написать', 'Открыть профиль',
  ),
  en: m(
    'Match!|You can help {n} with {s}|Reach out to discuss how you can help each other.',
    'Match!|{n} can help you with {s}|Reach out to discuss how you can help each other.',
    'Write', 'Open profile',
  ),
  uk: m(
    'Збіг!|Ти можеш допомогти {n} — {s}|Напиши — обговоріть як ви можете допомогти одне одному.',
    'Збіг!|{n} може допомогти тобі — {s}|Напиши — обговоріть як ви можете допомогти одне одному.',
    'Написати', 'Відкрити профіль',
  ),
  be: m(
    'Супадзенне!|Ты можаш дапамагчы {n} — {s}|Напішы — абмяркуйце як вы можаце дапамагчы адзін аднаму.',
    'Супадзенне!|{n} можа дапамагчы табе — {s}|Напішы — абмяркуйце як вы можаце дапамагчы адзін аднаму.',
    'Напісаць', 'Адкрыць профіль',
  ),
  de: m(
    'Übereinstimmung!|Du kannst {n} helfen — {s}|Schreib — besprecht, wie ihr einander helfen könnt.',
    'Übereinstimmung!|{n} kann dir helfen — {s}|Schreib — besprecht, wie ihr einander helfen könnt.',
    'Schreiben', 'Profil öffnen',
  ),
  fr: m(
    'Correspondance !|Tu peux aider {n} — {s}|Écris pour discuter comment vous pouvez vous entraider.',
    'Correspondance !|{n} peut t\'aider — {s}|Écris pour discuter comment vous pouvez vous entraider.',
    'Écrire', 'Ouvrir le profil',
  ),
  es: m(
    '¡Coincidencia!|Puedes ayudar a {n} — {s}|Escribe para discutir cómo pueden ayudarse mutuamente.',
    '¡Coincidencia!|{n} puede ayudarte — {s}|Escribe para discutir cómo pueden ayudarse mutuamente.',
    'Escribir', 'Abrir perfil',
  ),
  pt: m(
    'Correspondência!|Você pode ajudar {n} — {s}|Escreva para discutir como podem se ajudar.',
    'Correspondência!|{n} pode te ajudar — {s}|Escreva para discutir como podem se ajudar.',
    'Escrever', 'Abrir perfil',
  ),
  it: m(
    'Corrispondenza!|Puoi aiutare {n} — {s}|Scrivi per discutere come potete aiutarvi.',
    'Corrispondenza!|{n} può aiutarti — {s}|Scrivi per discutere come potete aiutarvi.',
    'Scrivi', 'Apri profilo',
  ),
  nl: m(
    'Match!|Je kunt {n} helpen — {s}|Schrijf om te bespreken hoe jullie elkaar kunnen helpen.',
    'Match!|{n} kan je helpen — {s}|Schrijf om te bespreken hoe jullie elkaar kunnen helpen.',
    'Schrijven', 'Profiel openen',
  ),
  pl: m(
    'Dopasowanie!|Możesz pomóc {n} — {s}|Napisz — omówcie jak możecie sobie pomóc.',
    'Dopasowanie!|{n} może ci pomóc — {s}|Napisz — omówcie jak możecie sobie pomóc.',
    'Napisz', 'Otwórz profil',
  ),
  cs: m(
    'Shoda!|Můžeš pomoci {n} — {s}|Napiš — domluvte se, jak si můžete pomoci.',
    'Shoda!|{n} ti může pomoci — {s}|Napiš — domluvte se, jak si můžete pomoci.',
    'Napsat', 'Otevřít profil',
  ),
  ro: m(
    'Potrivire!|Poți ajuta pe {n} — {s}|Scrie pentru a discuta cum vă puteți ajuta reciproc.',
    'Potrivire!|{n} te poate ajuta — {s}|Scrie pentru a discuta cum vă puteți ajuta reciproc.',
    'Scrie', 'Deschide profil',
  ),
  sr: m(
    'Подударање!|Можеш помоћи {n} — {s}|Напиши — договорите како можете помоћи једно другом.',
    'Подударање!|{n} може да ти помогне — {s}|Напиши — договорите како можете помоћи једно другом.',
    'Напиши', 'Отвори профил',
  ),
  sv: m(
    'Matchning!|Du kan hjälpa {n} — {s}|Skriv för att diskutera hur ni kan hjälpa varandra.',
    'Matchning!|{n} kan hjälpa dig — {s}|Skriv för att diskutera hur ni kan hjälpa varandra.',
    'Skriv', 'Öppna profil',
  ),
  da: m(
    'Match!|Du kan hjælpe {n} — {s}|Skriv for at diskutere, hvordan I kan hjælpe hinanden.',
    'Match!|{n} kan hjælpe dig — {s}|Skriv for at diskutere, hvordan I kan hjælpe hinanden.',
    'Skriv', 'Åbn profil',
  ),
  no: m(
    'Treff!|Du kan hjelpe {n} — {s}|Skriv for å diskutere hvordan dere kan hjelpe hverandre.',
    'Treff!|{n} kan hjelpe deg — {s}|Skriv for å diskutere hvordan dere kan hjelpe hverandre.',
    'Skriv', 'Åpne profil',
  ),
  fi: m(
    'Osuma!|Voit auttaa käyttäjää {n} — {s}|Kirjoita — keskustelkaa miten voitte auttaa toisianne.',
    'Osuma!|{n} voi auttaa sinua — {s}|Kirjoita — keskustelkaa miten voitte auttaa toisianne.',
    'Kirjoita', 'Avaa profiili',
  ),
  tr: m(
    'Eşleşme!|{n} kişisine yardım edebilirsin — {s}|Yaz — birbirinize nasıl yardım edebileceğinizi konuşun.',
    'Eşleşme!|{n} sana yardım edebilir — {s}|Yaz — birbirinize nasıl yardım edebileceğinizi konuşun.',
    'Yaz', 'Profili aç',
  ),
  ar: m(
    'تطابق!|يمكنك مساعدة {n} — {s}|اكتب لمناقشة كيف يمكنكم مساعدة بعضكم البعض.',
    'تطابق!|{n} يمكنه مساعدتك — {s}|اكتب لمناقشة كيف يمكنكم مساعدة بعضكم البعض.',
    'اكتب', 'فتح الملف الشخصي',
  ),
  he: m(
    'התאמה!|אתה יכול לעזור ל{n} — {s}|כתוב כדי לדון איך תוכלו לעזור אחד לשני.',
    'התאמה!|{n} יכול לעזור לך — {s}|כתוב כדי לדון איך תוכלו לעזור אחד לשני.',
    'כתוב', 'פתח פרופיל',
  ),
  hi: m(
    'मिलान!|आप {n} की मदद कर सकते हैं — {s}|लिखें — चर्चा करें कि आप एक-दूसरे की कैसे मदद कर सकते हैं।',
    'मिलान!|{n} आपकी मदद कर सकते हैं — {s}|लिखें — चर्चा करें कि आप एक-दूसरे की कैसे मदद कर सकते हैं।',
    'लिखें', 'प्रोफ़ाइल खोलें',
  ),
  ja: m(
    'マッチ!|{n}さんを手伝えます — {s}|書いて — お互いにどう助け合えるか話し合いましょう。',
    'マッチ!|{n}さんがあなたを手伝えます — {s}|書いて — お互いにどう助け合えるか話し合いましょう。',
    '書く', 'プロフィールを開く',
  ),
  ko: m(
    '매칭!|{n}님을 도울 수 있습니다 — {s}|서로 어떻게 도울 수 있는지 이야기해 보세요.',
    '매칭!|{n}님이 도와줄 수 있습니다 — {s}|서로 어떻게 도울 수 있는지 이야기해 보세요.',
    '쓰기', '프로필 열기',
  ),
  zh: m(
    '匹配!|你可以帮助{n} — {s}|写信讨论如何互相帮助。',
    '匹配!|{n}可以帮助你 — {s}|写信讨论如何互相帮助。',
    '写信', '打开资料',
  ),
  th: m(
    'จับคู่สำเร็จ!|คุณสามารถช่วย {n} — {s}|เขียนเพื่อหารือว่าจะช่วยเหลือกันได้อย่างไร',
    'จับคู่สำเร็จ!|{n} สามารถช่วยคุณ — {s}|เขียนเพื่อหารือว่าจะช่วยเหลือกันได้อย่างไร',
    'เขียน', 'เปิดโปรไฟล์',
  ),
  vi: m(
    'Kết hợp!|Bạn có thể giúp {n} — {s}|Viết để thảo luận cách giúp đỡ lẫn nhau.',
    'Kết hợp!|{n} có thể giúp bạn — {s}|Viết để thảo luận cách giúp đỡ lẫn nhau.',
    'Viết', 'Mở hồ sơ',
  ),
  id: m(
    'Kecocokan!|Kamu bisa membantu {n} — {s}|Tulis untuk mendiskusikan bagaimana bisa saling membantu.',
    'Kecocokan!|{n} bisa membantumu — {s}|Tulis untuk mendiskusikan bagaimana bisa saling membantu.',
    'Tulis', 'Buka profil',
  ),
};

function getMsg(lang: string): MatchMsgSet {
  return MATCH_MSG[lang] || MATCH_MSG.en!;
}

/** Send TG notification about skill matches to a user (grouped by person) */
async function sendMatchTgNotification(
  recipientChatId: string,
  recipientLang: string,
  matchUserName: string,
  matchUserTgId: string | null,
  matchUserId: string,
  translatedSkills: string,
  direction: 'youCanHelp' | 'theyCanHelp',
): Promise<void> {
  const msg = getMsg(recipientLang);
  const text = msg[direction](matchUserName, translatedSkills);

  const buttons: TgReplyMarkup['inline_keyboard'] = [];

  const row: TgReplyMarkup['inline_keyboard'][0] = [];
  if (matchUserTgId) {
    row.push({ text: `💬 ${msg.writeBtn} ${matchUserName}`, url: `tg://user?id=${matchUserTgId}` });
  }
  row.push({ text: `📱 ${msg.profileBtn}`, web_app: { url: `${WEB_APP_URL}/profile/${matchUserId}` } });
  buttons.push(row);

  await sendTelegramMessage(recipientChatId, text, { inline_keyboard: buttons });
}

/** Group matches by userId, translate skill keys, send one TG per person */
async function sendGroupedTgNotifications(
  matches: MatchInfo[],
  categories: Map<string, { key: string; isOnline: boolean; translations: Record<string, string> | null }>,
  users: Map<string, { name: string; tgChatId: string | null; lang: string }>,
  ownerId: string,
  ownerDirection: 'youCanHelp' | 'theyCanHelp',
  matchedDirection: 'youCanHelp' | 'theyCanHelp',
): Promise<void> {
  const owner = users.get(ownerId);
  if (!owner) return;

  // Group by matched userId, keep category info
  const byUser = new Map<string, Array<{ key: string; translations: Record<string, string> | null }>>();
  for (const match of matches) {
    const cat = categories.get(match.categoryId);
    if (!cat) continue;
    const uid = match.userId;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({ key: cat.key, translations: cat.translations });
  }

  // Owner gets one message per matched person
  for (const [matchedUserId, catInfos] of byUser) {
    const matched = users.get(matchedUserId);
    if (!matched) continue;

    // Translate skills for recipient's language
    if (owner.tgChatId) {
      const skillsText = catInfos.map((c) => translateSkill(owner.lang, c.key, c.translations)).join(', ');
      sendMatchTgNotification(
        owner.tgChatId, owner.lang, matched.name, matched.tgChatId,
        matchedUserId, skillsText, ownerDirection,
      ).catch((err) => console.error('[SkillMatch TG] Error:', err));
    }

    // Each matched person gets one message about the owner
    if (matched.tgChatId) {
      const skillsText = catInfos.map((c) => translateSkill(matched.lang, c.key, c.translations)).join(', ');
      sendMatchTgNotification(
        matched.tgChatId, matched.lang, owner.name, owner.tgChatId,
        ownerId, skillsText, matchedDirection,
      ).catch((err) => console.error('[SkillMatch TG] Error:', err));
    }
  }
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
  // Skills feature hidden — skip match notifications
  return;

  // Filter out "other" placeholder categories
  const validCatIds = addedCategoryIds.length > 0
    ? (await db.skillCategory.findMany({
        where: { id: { in: addedCategoryIds }, key: { not: { startsWith: 'other' } } },
        select: { id: true },
      })).map((c) => c.id)
    : [];
  if (validCatIds.length === 0) return;

  // Get skill owner's city + country for offline skill filtering
  const owner = await db.user.findUnique({
    where: { id: skillOwnerId },
    select: { city: true, countryCode: true },
  });

  // Find users in network who NEED these categories (city+country filtered for offline)
  const networkIds = await getNetworkUserIds(db, skillOwnerId);
  const matches = await db.$queryRaw<Array<MatchInfo>>`
    SELECT un."userId", un."categoryId"
    FROM user_needs un
    JOIN skill_categories sc ON sc.id = un."categoryId"
    JOIN users u ON u.id = un."userId"
    WHERE un."categoryId" = ANY(${validCatIds})
      AND un."userId" != ${skillOwnerId}
      AND un."userId" = ANY(${networkIds})
      AND u."deletedAt" IS NULL
      AND (sc."isOnline" = true
           OR (LOWER(COALESCE(u.city, '')) = LOWER(COALESCE(${owner?.city ?? ''}, ''))
               AND COALESCE(u.city, '') != ''
               AND COALESCE(u.country_code, '') = COALESCE(${owner?.countryCode ?? ''}, '')
               AND COALESCE(u.country_code, '') != ''))
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

  // Web Push
  const matchedUserIds = [...new Set(matches.map((m) => m.userId))];
  sendPushNotification(db, matchedUserIds, {
    title: 'Skill Match',
    body: 'Someone in your network can help you!',
    url: `${WEB_APP_URL}/matches`,
  }).catch((err) => console.error('[WebPush SkillMatch] Failed:', err));
  sendPushNotification(db, [skillOwnerId], {
    title: 'Skill Match',
    body: 'You can help someone in your network!',
    url: `${WEB_APP_URL}/matches`,
  }).catch((err) => console.error('[WebPush SkillMatch] Failed:', err));

  // Send TG notifications (grouped by person)
  try {
    const allUserIds = [skillOwnerId, ...matchedUserIds];
    const [users, categories] = await Promise.all([
      resolveUsers(db, allUserIds),
      resolveCategories(db, matches.map((m) => m.categoryId)),
    ]);

    await sendGroupedTgNotifications(
      matches, categories, users, skillOwnerId, 'youCanHelp', 'theyCanHelp',
    );
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
  // Skills feature hidden — skip match notifications
  return;

  // Filter out "other" placeholder categories
  const validCatIds = addedCategoryIds.length > 0
    ? (await db.skillCategory.findMany({
        where: { id: { in: addedCategoryIds }, key: { not: { startsWith: 'other' } } },
        select: { id: true },
      })).map((c) => c.id)
    : [];
  if (validCatIds.length === 0) return;

  // Get need owner's city + country for offline skill filtering
  const owner = await db.user.findUnique({
    where: { id: needOwnerId },
    select: { city: true, countryCode: true },
  });

  // Find users in network who HAVE these skills (city+country filtered for offline)
  const networkIds = await getNetworkUserIds(db, needOwnerId);
  const matches = await db.$queryRaw<Array<MatchInfo>>`
    SELECT us."userId" AS "userId", us."categoryId"
    FROM user_skills us
    JOIN skill_categories sc ON sc.id = us."categoryId"
    JOIN users u ON u.id = us."userId"
    WHERE us."categoryId" = ANY(${validCatIds})
      AND us."userId" != ${needOwnerId}
      AND us."userId" = ANY(${networkIds})
      AND u."deletedAt" IS NULL
      AND (sc."isOnline" = true
           OR (LOWER(COALESCE(u.city, '')) = LOWER(COALESCE(${owner?.city ?? ''}, ''))
               AND COALESCE(u.city, '') != ''
               AND COALESCE(u.country_code, '') = COALESCE(${owner?.countryCode ?? ''}, '')
               AND COALESCE(u.country_code, '') != ''))
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

  // Web Push
  const matchedUserIds = [...new Set(matches.map((m) => m.userId))];
  sendPushNotification(db, [needOwnerId], {
    title: 'Skill Match',
    body: 'Someone in your network can help you!',
    url: `${WEB_APP_URL}/matches`,
  }).catch((err) => console.error('[WebPush NeedMatch] Failed:', err));
  sendPushNotification(db, matchedUserIds, {
    title: 'Skill Match',
    body: 'You can help someone in your network!',
    url: `${WEB_APP_URL}/matches`,
  }).catch((err) => console.error('[WebPush NeedMatch] Failed:', err));

  // Send TG notifications (grouped by person)
  try {
    const allUserIds = [needOwnerId, ...matchedUserIds];
    const [users, categories] = await Promise.all([
      resolveUsers(db, allUserIds),
      resolveCategories(db, matches.map((m) => m.categoryId)),
    ]);

    await sendGroupedTgNotifications(
      matches, categories, users, needOwnerId, 'theyCanHelp', 'youCanHelp',
    );
  } catch (err) {
    console.error('[SkillMatch TG] Failed to send TG notifications:', err);
  }
}

/**
 * Full rescan: find all skill matches for a user and create notifications.
 * Called when a new connection is created (networks may merge).
 */
export async function scanMatchesForUser(_db: PrismaClient, _userId: string): Promise<void> {
  // Skills feature hidden — skip match scan
  return;
}
