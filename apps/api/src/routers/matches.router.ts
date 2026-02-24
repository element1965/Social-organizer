import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { haversineKm, distanceHint } from '../services/geo.service.js';

interface MatchRow {
  user_id: string;
  user_name: string;
  photo_url: string | null;
  category_id: string;
  category_key: string;
  is_online: boolean;
  user_city: string | null;
  user_country: string | null;
  user_lat: number | null;
  user_lng: number | null;
  skill_note: string | null;
}

function processMatches(
  rows: MatchRow[],
  myLat: number | null,
  myLng: number | null,
  myCountry: string | null,
  myCity: string | null,
) {
  return rows.map((r) => {
    let distance: string | null = null;
    let geoMatch: 'sameCity' | 'sameCountry' | 'remote' | null = null;

    if (!r.is_online) {
      if (myCity && r.user_city && myCity.toLowerCase() === r.user_city.toLowerCase() && myCountry === r.user_country) {
        geoMatch = 'sameCity';
      } else if (myCountry && r.user_country && myCountry === r.user_country) {
        geoMatch = 'sameCountry';
      } else {
        geoMatch = 'remote';
      }
      if (myLat != null && myLng != null && r.user_lat != null && r.user_lng != null) {
        const km = haversineKm(myLat, myLng, r.user_lat, r.user_lng);
        distance = distanceHint(km);
      }
    }

    return {
      userId: r.user_id,
      userName: r.user_name,
      photoUrl: r.photo_url,
      categoryId: r.category_id,
      categoryKey: r.category_key,
      isOnline: r.is_online,
      note: r.skill_note,
      geoMatch,
      distance,
    };
  });
}

export const matchesRouter = router({
  whoCanHelpMe: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { latitude: true, longitude: true, countryCode: true, city: true },
    });

    const rows = await ctx.db.$queryRaw<MatchRow[]>`
      SELECT
        u.id AS user_id, u.name AS user_name, u."photoUrl" AS photo_url,
        sc.id AS category_id, sc.key AS category_key, sc."isOnline" AS is_online,
        u.city AS user_city, u.country_code AS user_country,
        u.latitude AS user_lat, u.longitude AS user_lng,
        us.note AS skill_note
      FROM user_needs un
      JOIN user_skills us ON us."categoryId" = un."categoryId"
      JOIN skill_categories sc ON sc.id = un."categoryId"
      JOIN users u ON u.id = us."userId"
      JOIN connections c
        ON (c."userAId" = ${ctx.userId} AND c."userBId" = us."userId")
        OR (c."userBId" = ${ctx.userId} AND c."userAId" = us."userId")
      WHERE un."userId" = ${ctx.userId}
        AND us."userId" != ${ctx.userId}
        AND u."deletedAt" IS NULL
      ORDER BY sc."group", sc."sortOrder"
    `;

    return processMatches(rows, me?.latitude ?? null, me?.longitude ?? null, me?.countryCode ?? null, me?.city ?? null);
  }),

  whoNeedsMyHelp: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { latitude: true, longitude: true, countryCode: true, city: true },
    });

    const rows = await ctx.db.$queryRaw<MatchRow[]>`
      SELECT
        u.id AS user_id, u.name AS user_name, u."photoUrl" AS photo_url,
        sc.id AS category_id, sc.key AS category_key, sc."isOnline" AS is_online,
        u.city AS user_city, u.country_code AS user_country,
        u.latitude AS user_lat, u.longitude AS user_lng,
        un.note AS skill_note
      FROM user_skills us
      JOIN user_needs un ON un."categoryId" = us."categoryId"
      JOIN skill_categories sc ON sc.id = us."categoryId"
      JOIN users u ON u.id = un."userId"
      JOIN connections c
        ON (c."userAId" = ${ctx.userId} AND c."userBId" = un."userId")
        OR (c."userBId" = ${ctx.userId} AND c."userAId" = un."userId")
      WHERE us."userId" = ${ctx.userId}
        AND un."userId" != ${ctx.userId}
        AND u."deletedAt" IS NULL
      ORDER BY sc."group", sc."sortOrder"
    `;

    return processMatches(rows, me?.latitude ?? null, me?.longitude ?? null, me?.countryCode ?? null, me?.city ?? null);
  }),

  matchNotifications: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.skillMatchNotification.findMany({
      where: { userId: ctx.userId, status: { in: ['UNREAD', 'READ'] } },
      include: {
        matchUser: { select: { id: true, name: true, photoUrl: true } },
        category: { select: { id: true, key: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }),

  dismissMatchNotification: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.skillMatchNotification.update({
        where: { id: input.id, userId: ctx.userId },
        data: { status: 'DISMISSED' },
      });
    }),

  markMatchNotificationsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.skillMatchNotification.updateMany({
      where: { userId: ctx.userId, status: 'UNREAD' },
      data: { status: 'READ' },
    });
    return { success: true };
  }),

  unreadMatchCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.skillMatchNotification.count({
      where: { userId: ctx.userId, status: 'UNREAD' },
    });
    return { count };
  }),
});
