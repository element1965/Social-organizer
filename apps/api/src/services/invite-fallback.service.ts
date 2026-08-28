import type { PrismaClient } from '@so/db';
import { sendPendingNotification } from './notification.service.js';

/**
 * Resolve an invite token to the inviter's userId.
 * Mirrors invite.accept resolution: single-use InviteLink → userId → referralSlug.
 */
async function resolveInviterId(db: PrismaClient, token: string): Promise<string | null> {
  const invite = await db.inviteLink.findUnique({ where: { token }, select: { inviterId: true } });
  if (invite) return invite.inviterId;
  const byId = await db.user.findUnique({ where: { id: token }, select: { id: true } });
  if (byId) return byId.id;
  const bySlug = await db.user.findUnique({
    where: { referralSlug: token.toLowerCase() },
    select: { id: true },
  });
  return bySlug?.id ?? null;
}

/**
 * Server-side safety net for lost invite deep links.
 *
 * The bot records the invite token on /start (BotStart.inviteToken), but the mini app
 * can lose it before invite.accept runs: the web_app page fails to load (DNS/network),
 * the user reopens the app via the bot menu button without start_param, or opens it
 * later from a plain "Open" button. In all those cases the user registers with no
 * connection to the inviter and ends up as a disconnected cluster in the graph.
 *
 * Called on every Telegram login: if a tracked invite token exists for this chat,
 * create the same PENDING connection the normal invite flow creates, then consume
 * the token. Idempotent — safe to race with InvitePage's invite.accept.
 */
export async function applyBotStartInvite(
  db: PrismaClient,
  userId: string,
  chatId: string,
): Promise<void> {
  const botStart = await db.botStart.findUnique({ where: { chatId } });
  const token = botStart?.inviteToken;
  if (!token) return;

  const inviterId = await resolveInviterId(db, token);
  // Consume the token so it is not re-applied on every login
  await db.botStart.update({ where: { chatId }, data: { inviteToken: null } }).catch(() => {});
  if (!inviterId || inviterId === userId) return;

  const [userAId, userBId] = [userId, inviterId].sort() as [string, string];
  const connected = await db.connection.findUnique({
    where: { userAId_userBId: { userAId, userBId } },
  });
  if (connected) return;

  const pending = await db.pendingConnection.findFirst({
    where: {
      OR: [
        { fromUserId: userId, toUserId: inviterId, status: 'PENDING' },
        { fromUserId: inviterId, toUserId: userId, status: 'PENDING' },
      ],
    },
  });
  if (pending) return;

  await db.pendingConnection.upsert({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId: inviterId } },
    create: { fromUserId: userId, toUserId: inviterId },
    update: { status: 'PENDING', resolvedAt: null },
  });

  console.log('[invite-fallback] pending connection created from botStart:', userId, '->', inviterId);

  const applicant = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  sendPendingNotification(db, inviterId, 'new', applicant?.name || '').catch((err) => {
    console.error('[invite-fallback] pending notification failed:', err);
  });
}

/**
 * One-shot startup backfill: users who pressed /start with an invite token, registered,
 * but never got connected (mini app lost the token). Tokens are consumed on apply,
 * so repeated runs scan an ever-shrinking set.
 */
export async function backfillBotStartInvites(db: PrismaClient): Promise<void> {
  const botStarts = await db.botStart.findMany({
    where: { inviteToken: { not: null } },
    select: { chatId: true },
  });
  let applied = 0;
  for (const bs of botStarts) {
    const account = await db.platformAccount.findUnique({
      where: { platform_platformId: { platform: 'TELEGRAM', platformId: bs.chatId } },
      select: { userId: true },
    });
    if (!account) continue; // never registered — reminder worker handles them
    await applyBotStartInvite(db, account.userId, bs.chatId).catch((err) => {
      console.error('[invite-fallback] backfill failed for chat', bs.chatId, err);
    });
    applied++;
  }
  console.log(`[invite-fallback] backfill done: ${applied}/${botStarts.length} tracked invites applied to registered users`);
}
