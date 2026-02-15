/**
 * @so/gun-backup — decentralized backup of the trust network graph via Gun.js (IndexedDB).
 *
 * Stores up to 3 levels of depth as a flat nodes+edges list.
 * Purpose: if the server is blocked, the network can be restored from client-side backups.
 * Gun.js relay syncs data between clients — each user's device stores their neighborhood,
 * creating cross-redundancy (my graph is also stored by my contacts as their level 2-3).
 */

let gunInstance: GunInstance | null = null;

interface GunNode {
  put: (data: Record<string, unknown>) => GunNode;
  get: (key: string) => GunNode;
  once: (cb: (data: unknown) => void) => void;
  map: () => GunNode;
  on: (cb: (data: unknown, key: string) => void) => void;
}

interface GunInstance extends GunNode {
  get: (key: string) => GunNode;
}

interface NodeData {
  id: string;
  name: string;
  photoUrl: string | null;
}

interface EdgeData {
  from: string;
  to: string;
}

interface GraphBackup {
  userId: string;
  nodes: NodeData[];
  edges: EdgeData[];
  syncedAt: string;
}

/**
 * Initialize Gun.js with IndexedDB for local storage.
 * Call once at app startup. Pass relay server URLs as peers for cross-device sync.
 */
export async function initGunBackup(peers: string[] = []): Promise<void> {
  if (gunInstance) return;
  try {
    const Gun = (await import('gun')).default;
    gunInstance = Gun({ peers, localStorage: false }) as unknown as GunInstance;
  } catch {
    console.warn('[gun-backup] Failed to initialize Gun.js');
  }
}

/**
 * Save the network graph (nodes + edges, up to 3 levels) to local storage via Gun.js.
 */
export async function syncToLocal(data: GraphBackup): Promise<void> {
  if (!gunInstance) {
    await saveToIndexedDB(data);
    return;
  }

  const userNode = gunInstance.get('so-backup').get(data.userId);
  userNode.put({
    userId: data.userId,
    syncedAt: data.syncedAt,
    nodesJson: JSON.stringify(data.nodes),
    edgesJson: JSON.stringify(data.edges),
  });
}

/**
 * Read cached graph from local storage.
 */
export async function readFromLocal(userId: string): Promise<GraphBackup | null> {
  if (!gunInstance) {
    return readFromIndexedDB(userId);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(readFromIndexedDB(userId)), 2000);
    gunInstance!.get('so-backup').get(userId).once((data: unknown) => {
      clearTimeout(timeout);
      if (!data || typeof data !== 'object') {
        resolve(readFromIndexedDB(userId));
        return;
      }
      const d = data as Record<string, unknown>;
      try {
        resolve({
          userId: String(d['userId'] ?? userId),
          nodes: JSON.parse(String(d['nodesJson'] ?? '[]')),
          edges: JSON.parse(String(d['edgesJson'] ?? '[]')),
          syncedAt: String(d['syncedAt'] ?? ''),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/* ---------- Fallback: raw IndexedDB (without Gun.js) ---------- */

const DB_NAME = 'so-graph-backup';
const STORE_NAME = 'graph';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToIndexedDB(data: GraphBackup): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data);
    db.close();
  } catch {
    console.warn('[gun-backup] IndexedDB save failed');
  }
}

async function readFromIndexedDB(userId: string): Promise<GraphBackup | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(userId);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as GraphBackup) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export type { GraphBackup, NodeData, EdgeData };
