import { router, protectedProcedure } from '../trpc.js';
import { isAdmin } from '../admin.js';

// Union-Find for connected components
class UnionFind {
  parent: Map<string, string> = new Map();
  rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.rank.set(x, 0); }
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }

  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!, rankB = this.rank.get(rb)!;
    if (rankA < rankB) this.parent.set(ra, rb);
    else if (rankA > rankB) this.parent.set(rb, ra);
    else { this.parent.set(rb, ra); this.rank.set(ra, rankA + 1); }
  }
}

export const clusterRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const admin = isAdmin(ctx.userId);

    // Load all connections
    const connections = await ctx.db.connection.findMany({
      select: { userAId: true, userBId: true },
    });

    // Build union-find
    const uf = new UnionFind();
    for (const c of connections) { uf.union(c.userAId, c.userBId); }

    // Group users by root
    const clusters = new Map<string, Set<string>>();
    for (const uid of uf.parent.keys()) {
      const root = uf.find(uid);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root)!.add(uid);
    }

    // Collect IDs of users already in clusters
    const usersInClusters = new Set(uf.parent.keys());

    // For admin: load ALL users to find isolated ones (no connections)
    let isolatedUsers: Array<{ id: string; name: string; remainingBudget: number | null; createdAt: Date }> = [];
    if (admin) {
      isolatedUsers = await ctx.db.user.findMany({
        where: { id: { notIn: [...usersInClusters] }, deletedAt: null },
        select: { id: true, name: true, remainingBudget: true, createdAt: true },
      });
    }

    // Find which cluster current user belongs to
    const myRoot = uf.parent.has(ctx.userId) ? uf.find(ctx.userId) : null;

    // Load budget data for all users in clusters
    const allUserIds = [...uf.parent.keys()];
    const users = await ctx.db.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, name: true, remainingBudget: true, createdAt: true, deletedAt: true },
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    const activeUserIds = new Set(users.filter(u => !u.deletedAt).map(u => u.id));

    // Count connections per user for picking cluster representative
    const connCount = new Map<string, number>();
    for (const c of connections) {
      connCount.set(c.userAId, (connCount.get(c.userAId) ?? 0) + 1);
      connCount.set(c.userBId, (connCount.get(c.userBId) ?? 0) + 1);
    }

    // Build cluster info
    const result: Array<{
      rootUserId: string;
      rootUserName: string;
      memberCount: number;
      totalBudget: number;
      isMine: boolean;
    }> = [];

    for (const [root, members] of clusters) {
      const memberCount = [...members].filter(id => activeUserIds.has(id)).length;
      // Visibility: admin sees all, non-admin sees clusters with >3 members
      if (!admin && memberCount <= 3) continue;

      let totalBudget = 0;
      let best: typeof users[number] | undefined;
      let bestConns = -1;
      for (const uid of members) {
        if (!activeUserIds.has(uid)) continue;
        const u = userMap.get(uid);
        if (u) {
          totalBudget += u.remainingBudget ?? 0;
          const c = connCount.get(uid) ?? 0;
          if (c > bestConns || (c === bestConns && best && u.createdAt < best.createdAt)) {
            best = u;
            bestConns = c;
          }
        }
      }

      result.push({
        rootUserId: best?.id || root,
        rootUserName: best?.name || 'Unknown',
        memberCount,
        totalBudget: Math.round(totalBudget),
        isMine: myRoot === root,
      });
    }

    // For admin: add isolated users as individual "clusters" of size 1
    if (admin) {
      for (const u of isolatedUsers) {
        result.push({
          rootUserId: u.id,
          rootUserName: u.name,
          memberCount: 1,
          totalBudget: Math.round(u.remainingBudget ?? 0),
          isMine: u.id === ctx.userId,
        });
      }
    }

    // Sort by memberCount desc
    result.sort((a, b) => b.memberCount - a.memberCount);
    return result;
  }),

  myCluster: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db.connection.findMany({
      select: { userAId: true, userBId: true },
    });

    const uf = new UnionFind();
    for (const c of connections) { uf.union(c.userAId, c.userBId); }

    if (!uf.parent.has(ctx.userId)) {
      return { memberCount: 1, totalBudget: 0, members: [] };
    }

    const myRoot = uf.find(ctx.userId);
    const memberIds: string[] = [];
    for (const [uid] of uf.parent) {
      if (uf.find(uid) === myRoot) memberIds.push(uid);
    }

    const members = await ctx.db.user.findMany({
      where: { id: { in: memberIds }, deletedAt: null },
      select: { id: true, name: true, photoUrl: true, remainingBudget: true },
    });

    const totalBudget = members.reduce((sum, m) => sum + (m.remainingBudget ?? 0), 0);

    return {
      memberCount: members.length,
      totalBudget: Math.round(totalBudget),
      members: members.map(m => ({
        id: m.id,
        name: m.name,
        photoUrl: m.photoUrl,
        budget: Math.round(m.remainingBudget ?? 0),
      })),
    };
  }),
});
