import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { haversineKm, distanceHint } from '../services/geo.service.js';
import { tryFindReplacement } from '../services/chain-finder.service.js';
import { getNetworkUserIds } from '../services/bfs.service.js';
import { ADMIN_IDS } from '../admin.js';

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

// Admin IDs to exclude from match results (admins see matches but don't appear in them)
const adminIdArray = ADMIN_IDS.length > 0 ? ADMIN_IDS : ['__none__'];

export const matchesRouter = router({
  whoCanHelpMe: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { latitude: true, longitude: true, countryCode: true, city: true },
    });

    const networkIds = await getNetworkUserIds(ctx.db, ctx.userId);

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
      WHERE un."userId" = ${ctx.userId}
        AND us."userId" != ${ctx.userId}
        AND us."userId" = ANY(${networkIds})
        AND u.id != ALL(${adminIdArray})
        AND u."deletedAt" IS NULL
        AND sc.key NOT LIKE 'other%'
        AND (sc."isOnline" = true
             OR (LOWER(COALESCE(u.city, '')) = LOWER(COALESCE(${me?.city ?? ''}, ''))
                 AND COALESCE(u.city, '') != ''
                 AND COALESCE(u.country_code, '') = COALESCE(${me?.countryCode ?? ''}, '')
                 AND COALESCE(u.country_code, '') != ''))
      ORDER BY sc."group", sc."sortOrder"
    `;

    return processMatches(rows, me?.latitude ?? null, me?.longitude ?? null, me?.countryCode ?? null, me?.city ?? null);
  }),

  whoNeedsMyHelp: protectedProcedure.query(async ({ ctx }) => {
    const me = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { latitude: true, longitude: true, countryCode: true, city: true },
    });

    const networkIds = await getNetworkUserIds(ctx.db, ctx.userId);

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
      WHERE us."userId" = ${ctx.userId}
        AND un."userId" != ${ctx.userId}
        AND un."userId" = ANY(${networkIds})
        AND u.id != ALL(${adminIdArray})
        AND u."deletedAt" IS NULL
        AND sc.key NOT LIKE 'other%'
        AND (sc."isOnline" = true
             OR (LOWER(COALESCE(u.city, '')) = LOWER(COALESCE(${me?.city ?? ''}, ''))
                 AND COALESCE(u.city, '') != ''
                 AND COALESCE(u.country_code, '') = COALESCE(${me?.countryCode ?? ''}, '')
                 AND COALESCE(u.country_code, '') != ''))
      ORDER BY sc."group", sc."sortOrder"
    `;

    return processMatches(rows, me?.latitude ?? null, me?.longitude ?? null, me?.countryCode ?? null, me?.city ?? null);
  }),

  /** Get clearing chains where the current user participates */
  myChains: protectedProcedure.query(async ({ ctx }) => {
    const chains = await ctx.db.matchChain.findMany({
      where: {
        status: { in: ['PROPOSED', 'ACTIVE', 'COMPLETED'] },
        links: { some: { OR: [{ giverId: ctx.userId }, { receiverId: ctx.userId }] } },
      },
      include: {
        links: {
          orderBy: { position: 'asc' },
          include: {
            giver: { select: { id: true, name: true, photoUrl: true } },
            receiver: { select: { id: true, name: true, photoUrl: true } },
            category: { select: { id: true, key: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return chains.map((ch) => ({
      id: ch.id,
      status: ch.status,
      length: ch.length,
      telegramChatUrl: ch.telegramChatUrl,
      chatAddedBy: ch.chatAddedBy,
      createdAt: ch.createdAt,
      links: ch.links.map((l) => ({
        id: l.id,
        position: l.position,
        giver: l.giver,
        receiver: l.receiver,
        categoryKey: l.category.key,
        offerHours: l.offerHours,
        offerDescription: l.offerDescription,
        giverConfirmed: l.giverConfirmed,
        receiverConfirmed: l.receiverConfirmed,
        giverCompleted: l.giverCompleted,
        receiverCompleted: l.receiverCompleted,
      })),
    }));
  }),

  /** Giver sets their offer (hours + description) for a link */
  setOffer: protectedProcedure
    .input(z.object({
      linkId: z.string(),
      hours: z.number().min(0.5).max(100),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.matchChainLink.findFirst({
        where: { id: input.linkId, giverId: ctx.userId },
      });
      if (!link) return null;

      return ctx.db.matchChainLink.update({
        where: { id: input.linkId },
        data: {
          offerHours: input.hours,
          offerDescription: input.description || null,
          giverConfirmed: true, // setting offer = confirming from giver side
        },
      });
    }),

  /** Receiver confirms they accept the offer */
  confirmLink: protectedProcedure
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.matchChainLink.findFirst({
        where: { id: input.linkId, receiverId: ctx.userId },
      });
      if (!link) return null;

      await ctx.db.matchChainLink.update({
        where: { id: input.linkId },
        data: { receiverConfirmed: true },
      });

      // Check if ALL links in chain are confirmed → ACTIVE
      const allLinks = await ctx.db.matchChainLink.findMany({
        where: { chainId: link.chainId },
      });
      const allConfirmed = allLinks.every((l) => l.giverConfirmed && l.receiverConfirmed);
      if (allConfirmed) {
        await ctx.db.matchChain.update({
          where: { id: link.chainId },
          data: { status: 'ACTIVE' },
        });
      }

      return { success: true };
    }),

  /** Mark a link as completed (giver or receiver) */
  completeLink: protectedProcedure
    .input(z.object({
      linkId: z.string(),
      role: z.enum(['giver', 'receiver']),
    }))
    .mutation(async ({ ctx, input }) => {
      const whereClause = input.role === 'giver'
        ? { id: input.linkId, giverId: ctx.userId }
        : { id: input.linkId, receiverId: ctx.userId };

      const link = await ctx.db.matchChainLink.findFirst({ where: whereClause });
      if (!link) return null;

      const updateData = input.role === 'giver'
        ? { giverCompleted: true }
        : { receiverCompleted: true };

      await ctx.db.matchChainLink.update({
        where: { id: input.linkId },
        data: updateData,
      });

      // Check if ALL links in chain are completed → COMPLETED
      const allLinks = await ctx.db.matchChainLink.findMany({
        where: { chainId: link.chainId },
      });
      const allCompleted = allLinks.every((l) => {
        const gc = l.id === input.linkId ? (input.role === 'giver' ? true : l.giverCompleted) : l.giverCompleted;
        const rc = l.id === input.linkId ? (input.role === 'receiver' ? true : l.receiverCompleted) : l.receiverCompleted;
        return gc && rc;
      });
      if (allCompleted) {
        await ctx.db.matchChain.update({
          where: { id: link.chainId },
          data: { status: 'COMPLETED' },
        });
      }

      return { success: true };
    }),

  /** Cancel a chain (any participant can cancel) */
  cancelChain: protectedProcedure
    .input(z.object({ chainId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const chain = await ctx.db.matchChain.findFirst({
        where: {
          id: input.chainId,
          status: { in: ['PROPOSED', 'ACTIVE'] },
          links: { some: { OR: [{ giverId: ctx.userId }, { receiverId: ctx.userId }] } },
        },
      });
      if (!chain) return null;

      return ctx.db.matchChain.update({
        where: { id: input.chainId },
        data: { status: 'CANCELLED' },
      });
    }),

  /** Decline participation — try to find replacement, otherwise cancel */
  declineLink: protectedProcedure
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const link = await ctx.db.matchChainLink.findFirst({
        where: {
          id: input.linkId,
          OR: [{ giverId: ctx.userId }, { receiverId: ctx.userId }],
        },
        include: { chain: true },
      });
      if (!link) return null;
      if (link.chain.status === 'COMPLETED' || link.chain.status === 'CANCELLED') return null;

      // Mark as BROKEN while we search for replacement
      await ctx.db.matchChain.update({
        where: { id: link.chainId },
        data: { status: 'BROKEN' },
      });

      const replacementId = await tryFindReplacement(ctx.db, link.chainId, ctx.userId);

      if (replacementId) {
        return { replaced: true, replacementId, status: 'PROPOSED' as const };
      }

      // No replacement — cancel chain
      await ctx.db.matchChain.update({
        where: { id: link.chainId },
        data: { status: 'CANCELLED' },
      });
      return { replaced: false, replacementId: null, status: 'CANCELLED' as const };
    }),

  /** Save Telegram group chat link for a chain (any participant can do it) */
  setChatLink: protectedProcedure
    .input(z.object({
      chainId: z.string(),
      telegramChatUrl: z.string().url().regex(/t\.me\//),
    }))
    .mutation(async ({ ctx, input }) => {
      const chain = await ctx.db.matchChain.findFirst({
        where: {
          id: input.chainId,
          links: { some: { OR: [{ giverId: ctx.userId }, { receiverId: ctx.userId }] } },
        },
      });
      if (!chain) return null;

      return ctx.db.matchChain.update({
        where: { id: input.chainId },
        data: {
          telegramChatUrl: input.telegramChatUrl,
          chatAddedBy: ctx.userId,
        },
      });
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
