import type { PrismaClient } from '@so/db';
import { CLUSTER_ROOT_OVERRIDE } from '../admin.js';
import { getGraph } from './graph-cache.service.js';

/**
 * Clusters for the admin statistics: the connected components of the handshake graph, taken from the
 * graph in memory. Nothing here reads the connections table or the whole users table.
 *
 * A cluster is named after its oldest member. Ids are cuids, which start with their creation time, so
 * the smallest id is the oldest account: no dates have to be read for every member.
 * Exception kept from before: the founders' cluster (CLUSTER_ROOT_OVERRIDE) is named after its root.
 */

export interface ClusterInfo {
  /** The member the cluster is named after */
  rootUserId: string;
  /** Members that are not deleted accounts */
  members: string[];
}

export interface Clusters {
  list: ClusterInfo[];
  /** Person → the cluster they are in (by `rootUserId`); people without connections are not here */
  rootOf: Map<string, string>;
  /** Direct connections of a person */
  degree: (userId: string) => number;
  /** Sum of direct connections over people who are not deleted */
  totalDegree: number;
}

export async function findClusters(db: PrismaClient): Promise<Clusters> {
  const { adj, deleted } = await getGraph(db);
  const seen = new Set<string>();
  const list: ClusterInfo[] = [];
  const rootOf = new Map<string, string>();
  let totalDegree = 0;

  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    // A deleted account that still has connections (muted by the bot) stays a way through, as before
    const component: string[] = [start];
    seen.add(start);
    for (let i = 0; i < component.length; i++) {
      for (const { neighbor } of adj.get(component[i]!) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        component.push(neighbor);
      }
    }
    const members = component.filter((id) => !deleted.has(id));
    if (members.length === 0) continue;
    for (const id of members) totalDegree += adj.get(id)?.length ?? 0;

    let rootUserId = members[0]!;
    for (const id of members) if (id < rootUserId) rootUserId = id;
    const { member, root } = CLUSTER_ROOT_OVERRIDE;
    if (component.includes(member) && members.includes(root)) rootUserId = root;

    list.push({ rootUserId, members });
    for (const id of members) rootOf.set(id, rootUserId);
  }

  list.sort((a, b) => b.members.length - a.members.length || (a.rootUserId < b.rootUserId ? -1 : 1));
  return { list, rootOf, degree: (userId) => adj.get(userId)?.length ?? 0, totalDegree };
}
