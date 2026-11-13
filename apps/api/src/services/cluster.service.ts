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
  const graph = await getGraph(db);
  const seen = new Uint8Array(graph.size);
  const list: ClusterInfo[] = [];
  const rootOf = new Map<string, string>();
  let totalDegree = 0;
  const { member: founder, root: founderRoot } = CLUSTER_ROOT_OVERRIDE;

  for (let start = 0; start < graph.size; start++) {
    if (seen[start] === 1 || graph.degree(start) === 0) continue;
    // A deleted account that still has connections (muted by the bot) stays a way through, as before
    const component: number[] = [start];
    seen[start] = 1;
    graph.walk(start, Infinity, (n) => {
      seen[n] = 1;
      component.push(n);
    }, true);

    const members: string[] = [];
    let hasFounder = false;
    for (const n of component) {
      const id = graph.ids[n]!;
      if (id === founder) hasFounder = true;
      if (graph.isDeleted(n)) continue;
      members.push(id);
      totalDegree += graph.degree(n);
    }
    if (members.length === 0) continue;

    let rootUserId = members[0]!;
    for (const id of members) if (id < rootUserId) rootUserId = id;
    if (hasFounder && members.includes(founderRoot)) rootUserId = founderRoot;

    list.push({ rootUserId, members });
    for (const id of members) rootOf.set(id, rootUserId);
  }

  list.sort((a, b) => b.members.length - a.members.length || (a.rootUserId < b.rootUserId ? -1 : 1));
  const degree = (userId: string) => {
    const n = graph.find(userId);
    return n === undefined ? 0 : graph.degree(n);
  };
  return { list, rootOf, degree, totalDegree };
}
