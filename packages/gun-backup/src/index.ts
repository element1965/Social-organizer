/**
 * @so/gun-backup — decentralized backup of the trust network graph via Gun.js (IndexedDB).
 *
 * Stores up to 3 levels of depth as a flat nodes+edges list.
 * Purpose: if the server is blocked, the network can be restored from client-side backups.
 * Gun.js relay syncs data between clients — each user's device stores their neighborhood,
 * creating cross-redundancy (my graph is also stored by my contacts as their level 2-3).
 *
 * The IndexedDB copy is also what the app shows when it has no connection (the "saved copy"):
 * the graph record plus a second record with the contacts of direct connections.
 * Every record is keyed by the owner's user id and verified on read.
 */

let gunInstance: GunInstance | null = null;

/**
 * Bumped by clearLocal(). Every write remembers the value it started with and drops itself when it changed, so a
 * write that was in flight during sign-out cannot bring the wiped copy back.
 */
let epoch = 0;
let activeUser: (() => string | null) | null = null;

/** Register how to read the currently signed-in user id. Writes for any other user are refused. */
export function setActiveUser(getter: () => string | null): void {
  activeUser = getter;
}

function mayWrite(userId: string, startedAt: number): boolean {
  if (startedAt !== epoch) return false;
  return !activeUser || activeUser() === userId;
}

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
  /** Handshake level from the owner (0 = the owner). Older copies may lack it. */
  depth?: number;
  connectionCount?: number;
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
  /** The owner's own names for direct connections (person id -> nickname). */
  nicknames?: Record<string, string>;
}

/** One contact of a person as the owner could see it online (type + value, e.g. telegram + @name). */
interface SavedContact {
  type: string;
  value: string;
}

interface SavedPerson {
  contacts: SavedContact[];
  savedAt: string;
}

interface PeopleBackup {
  userId: string;
  people: Record<string, SavedPerson>;
  updatedAt: string;
}

/** Bounds keep the copy small: the 3-ring slice is capped at 500 nodes, direct connections at about 150. */
const MAX_NODES = 600;
const MAX_EDGES = 1500;
const MAX_NAME = 200;
const MAX_PHOTO_URL = 512;
const MAX_SAVED_PEOPLE = 200;
const MAX_CONTACTS_PER_PERSON = 12;
const MAX_CONTACT_VALUE = 300;

function clean(data: GraphBackup): GraphBackup {
  const nodes = data.nodes.slice(0, MAX_NODES).map((n) => ({
    id: n.id,
    name: String(n.name ?? '').slice(0, MAX_NAME),
    // Photos are links; an inline data: image would bloat the copy and cannot be shown offline anyway
    photoUrl: n.photoUrl && n.photoUrl.length <= MAX_PHOTO_URL && !n.photoUrl.startsWith('data:') ? n.photoUrl : null,
    ...(typeof n.depth === 'number' ? { depth: n.depth } : {}),
    ...(typeof n.connectionCount === 'number' ? { connectionCount: n.connectionCount } : {}),
  }));
  const nicknames: Record<string, string> = {};
  for (const [id, nick] of Object.entries(data.nicknames ?? {})) {
    if (nick) nicknames[id] = String(nick).slice(0, MAX_NAME);
  }
  return {
    userId: data.userId,
    nodes,
    edges: data.edges.slice(0, MAX_EDGES).map((e) => ({ from: e.from, to: e.to })),
    syncedAt: data.syncedAt,
    nicknames,
  };
}

function validGraph(value: unknown, userId: string): GraphBackup | null {
  const rec = value as GraphBackup | null | undefined;
  // A copy belongs to one account: another user's record is never returned
  if (!rec || rec.userId !== userId || !Array.isArray(rec.nodes) || !Array.isArray(rec.edges)) return null;
  return rec;
}

function withToken(Native: typeof globalThis.WebSocket, getToken: () => string | null) {
  return class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      const token = getToken();
      const u = String(url);
      super(token ? `${u}${u.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : u, protocols);
    }
  };
}

/**
 * Initialize Gun.js with IndexedDB for local storage.
 * Call once at app startup. Pass relay server URLs as peers for cross-device sync.
 */
export async function initGunBackup(
  peers: string[] = [],
  getToken?: () => string | null,
): Promise<void> {
  if (gunInstance) return;
  try {
    const Gun = (await import('gun')).default;
    // The relay only accepts signed-in users: append the current access token on every (re)connect.
    const WebSocket = getToken && globalThis.WebSocket ? withToken(globalThis.WebSocket, getToken) : undefined;
    gunInstance = Gun({ peers, localStorage: false, ...(WebSocket ? { WebSocket } : {}) }) as unknown as GunInstance;
  } catch {
    console.warn('[gun-backup] Failed to initialize Gun.js');
  }
}

/**
 * Save the network graph (nodes + edges, up to 3 levels) to local storage via Gun.js.
 */
export async function syncToLocal(input: GraphBackup): Promise<boolean> {
  const startedAt = epoch;
  const data = clean(input);
  if (!mayWrite(data.userId, startedAt)) return false;
  // IndexedDB is the real device copy: Gun runs with localStorage:false and no storage adapter,
  // so it only keeps data in memory and on the relay — a closed tab used to lose the backup.
  const saved = await saveToIndexedDB(data, startedAt);
  if (!gunInstance || !mayWrite(data.userId, startedAt)) return saved;

  const userNode = gunInstance.get('so-backup').get(data.userId);
  userNode.put({
    userId: data.userId,
    syncedAt: data.syncedAt,
    nodesJson: JSON.stringify(data.nodes),
    edgesJson: JSON.stringify(data.edges),
    nicknamesJson: JSON.stringify(data.nicknames ?? {}),
  });
  return saved;
}

/**
 * Read cached graph from local storage. Returns null when there is no copy for this user.
 */
export async function readFromLocal(userId: string): Promise<GraphBackup | null> {
  // IndexedDB first — it is the persistent copy; Gun (memory + relay) is the fallback.
  const local = validGraph(await readFromIndexedDB(userId), userId);
  if (local || !gunInstance) return local;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 2000);
    gunInstance!.get('so-backup').get(userId).once((data: unknown) => {
      clearTimeout(timeout);
      if (!data || typeof data !== 'object') {
        resolve(null);
        return;
      }
      const d = data as Record<string, unknown>;
      try {
        resolve(
          validGraph(
            {
              userId: String(d['userId'] ?? userId),
              nodes: JSON.parse(String(d['nodesJson'] ?? '[]')),
              edges: JSON.parse(String(d['edgesJson'] ?? '[]')),
              syncedAt: String(d['syncedAt'] ?? ''),
              nicknames: JSON.parse(String(d['nicknamesJson'] ?? '{}')),
            },
            userId,
          ),
        );
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Remember the contacts of one person (as the owner saw them online). An empty list is saved too:
 * it replaces older contacts the person has since hidden. Oldest entries go first when over the cap.
 */
export async function saveContacts(userId: string, personId: string, contacts: SavedContact[]): Promise<void> {
  const startedAt = epoch;
  const entry: SavedPerson = {
    contacts: contacts
      .filter((c) => c.type && c.value.trim())
      .slice(0, MAX_CONTACTS_PER_PERSON)
      .map((c) => ({ type: String(c.type).slice(0, 40), value: c.value.trim().slice(0, MAX_CONTACT_VALUE) })),
    savedAt: new Date().toISOString(),
  };
  await updatePeople(userId, startedAt, (record) => {
    record.people[personId] = entry;
    const ids = Object.keys(record.people);
    if (ids.length > MAX_SAVED_PEOPLE) {
      ids
        .sort((a, b) => record.people[a]!.savedAt.localeCompare(record.people[b]!.savedAt))
        .slice(0, ids.length - MAX_SAVED_PEOPLE)
        .forEach((id) => delete record.people[id]);
    }
  });
}

/** Drop saved contacts of people who are no longer direct connections. */
export async function retainContacts(userId: string, keepIds: string[]): Promise<void> {
  const keep = new Set(keepIds);
  await updatePeople(userId, epoch, (record) => {
    for (const id of Object.keys(record.people)) if (!keep.has(id)) delete record.people[id];
  });
}

/** Saved contacts by person id. Empty when nothing is saved for this user. */
export async function readContacts(userId: string): Promise<Record<string, SavedPerson>> {
  const record = (await readRecord<PeopleBackup>(PEOPLE_STORE, userId)) as PeopleBackup | null;
  if (!record || record.userId !== userId || !record.people || typeof record.people !== 'object') return {};
  return record.people;
}

/**
 * Wipe the saved copy on this device (all accounts): the graph and contacts stores.
 * Called on sign-out and account deletion, and at start-up while nobody is signed in.
 */
export async function clearLocal(): Promise<void> {
  epoch += 1;
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction([STORE_NAME, PEOPLE_STORE], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(PEOPLE_STORE).clear();
      } catch {
        db.close();
        resolve();
        return;
      }
      const done = () => {
        db.close();
        resolve();
      };
      tx.oncomplete = done;
      tx.onerror = done;
      tx.onabort = done;
    });
  } catch {
    /* IndexedDB unavailable: nothing was stored */
  }
  // Gun runs without a storage adapter: its copy lives in memory and ends with the page. It is not nulled here,
  // because a null put would travel to the relay and erase backups other people hold for their own graphs.
}

/* ---------- Raw IndexedDB (the persistent copy) ---------- */

const DB_NAME = 'so-graph-backup';
const STORE_NAME = 'graph';
const PEOPLE_STORE = 'people';
const DB_VERSION = 3;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Before v2 the graph store had another key shape: recreate it. Later upgrades keep the saved graph.
      if (event.oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(PEOPLE_STORE)) {
        db.createObjectStore(PEOPLE_STORE, { keyPath: 'userId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Resolves true only when the transaction committed. */
async function saveToIndexedDB(data: GraphBackup, startedAt: number): Promise<boolean> {
  try {
    const db = await openDB();
    return await new Promise<boolean>((resolve) => {
      const finish = (ok: boolean) => {
        db.close();
        resolve(ok);
      };
      try {
        if (!mayWrite(data.userId, startedAt)) {
          finish(false);
          return;
        }
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(data);
        tx.oncomplete = () => finish(true);
        tx.onerror = () => finish(false);
        tx.onabort = () => finish(false);
      } catch {
        finish(false);
      }
    });
  } catch {
    console.warn('[gun-backup] IndexedDB save failed');
    return false;
  }
}

async function readFromIndexedDB(userId: string): Promise<GraphBackup | null> {
  return readRecord<GraphBackup>(STORE_NAME, userId);
}

async function readRecord<T>(store: string, key: string): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve) => {
      try {
        const req = db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as T) ?? null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/** Read-modify-write of the contacts record in one transaction, so two writers never lose each other's entries. */
async function updatePeople(userId: string, startedAt: number, change: (record: PeopleBackup) => void): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const done = () => {
        db.close();
        resolve();
      };
      try {
        const tx = db.transaction(PEOPLE_STORE, 'readwrite');
        const store = tx.objectStore(PEOPLE_STORE);
        const req = store.get(userId);
        req.onsuccess = () => {
          // Signed out (or someone else signed in) since the write began: drop it
          if (!mayWrite(userId, startedAt)) return;
          const found = req.result as PeopleBackup | undefined;
          const record: PeopleBackup =
            found && found.userId === userId && found.people && typeof found.people === 'object'
              ? found
              : { userId, people: {}, updatedAt: '' };
          change(record);
          record.updatedAt = new Date().toISOString();
          store.put(record);
        };
        tx.oncomplete = done;
        tx.onerror = done;
        tx.onabort = done;
      } catch {
        done();
      }
    });
  } catch {
    console.warn('[gun-backup] IndexedDB contacts save failed');
  }
}

export type { GraphBackup, NodeData, EdgeData, SavedContact, SavedPerson };
