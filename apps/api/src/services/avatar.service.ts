import { createHash } from 'node:crypto';
import type { PrismaClient } from '@so/db';

/**
 * Photos people upload themselves.
 *
 * The client sends a small JPEG as a data URL. It used to be stored as is in `users.photoUrl`, so every
 * list of people (the graph, the rings, connections) carried 10–20 KB per person on every poll. Now the
 * bytes live in `user_avatars` and `users.photoUrl` holds a short address, `/api/avatar/<userId>/<hash>`.
 * The hash is part of the address, so the browser may keep the picture for good: a new photo is a new address.
 */

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const MAX_AVATAR_BYTES = 150 * 1024;

export function isDataUrl(value: string | null | undefined): value is string {
  return !!value && value.startsWith('data:');
}

export function avatarPath(userId: string, hash: string): string {
  return `/api/avatar/${userId}/${hash}`;
}

/** The table comes with migration 20261111120000_load_fixes; until it is applied photos stay as they were. */
function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | undefined;
  return e?.code === 'P2021' || /user_avatars/.test(e?.message ?? '');
}

/**
 * Stores an uploaded photo and returns the address to keep in `users.photoUrl`.
 * Returns null for anything that is not a small base64 image (the caller rejects it), and the data URL
 * itself while the table does not exist yet.
 */
export async function storeAvatar(db: PrismaClient, userId: string, dataUrl: string): Promise<string | null> {
  const match = DATA_URL.exec(dataUrl);
  if (!match) return null;
  const data = Buffer.from(match[2]!, 'base64');
  if (data.length === 0 || data.length > MAX_AVATAR_BYTES) return null;
  const mime = match[1]!;
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 32);
  try {
    await db.userAvatar.upsert({
      where: { userId },
      create: { userId, mime, hash, data },
      update: { mime, hash, data },
    });
  } catch (err) {
    if (isMissingTable(err)) return dataUrl;
    throw err;
  }
  return avatarPath(userId, hash);
}

/** The picture behind an avatar address, only while it is still the person's current photo. */
export async function readAvatar(
  db: PrismaClient,
  userId: string,
  hash: string,
): Promise<{ mime: string; data: Buffer } | null> {
  const row = await db.userAvatar.findUnique({
    where: { userId },
    select: { mime: true, hash: true, data: true, user: { select: { photoUrl: true, deletedAt: true } } },
  });
  if (!row || row.hash !== hash || row.user.deletedAt) return null;
  if (row.user.photoUrl !== avatarPath(userId, hash)) return null;
  return { mime: row.mime, data: Buffer.from(row.data) };
}

/**
 * Moves photos stored the old way (a data URL in `users.photoUrl`) into the table. Runs at start-up,
 * a few people at a time; safe to run again, stops quietly when the table is not there yet.
 */
export async function backfillAvatars(db: PrismaClient): Promise<number> {
  let moved = 0;
  const skipped: string[] = [];
  for (;;) {
    const users = await db.user.findMany({
      where: { photoUrl: { startsWith: 'data:' }, id: { notIn: skipped } },
      select: { id: true, photoUrl: true },
      take: 25,
    });
    if (users.length === 0) break;
    for (const u of users) {
      const stored = u.photoUrl ? await storeAvatar(db, u.id, u.photoUrl) : null;
      if (stored && isDataUrl(stored)) return moved; // no table yet
      if (!stored) {
        // Not a picture we can serve (too large, another format): left as it is
        skipped.push(u.id);
        continue;
      }
      await db.user.update({ where: { id: u.id }, data: { photoUrl: stored } });
      moved++;
    }
    if (skipped.length > 500) break;
  }
  if (moved > 0) console.log(`[Avatar] moved ${moved} uploaded photos out of users.photoUrl`);
  return moved;
}
