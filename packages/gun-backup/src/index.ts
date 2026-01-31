/**
 * @so/gun-backup — локальный бэкап графа связей через Gun.js (IndexedDB).
 *
 * Хранит 2 уровня глубины: мои связи + связи моих связей.
 * Цель: если сервер недоступен, данные можно восстановить с клиентов.
 */

// Gun.js не имеет ESM-экспорта, используем динамический импорт
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

interface ConnectionData {
  userId: string;
  name: string;
  photoUrl: string | null;
  connectedAt: string;
}

interface GraphBackup {
  userId: string;
  connections: ConnectionData[];
  level2: Record<string, ConnectionData[]>;
  syncedAt: string;
}

/**
 * Инициализирует Gun.js с IndexedDB для локального хранения.
 * Вызывать один раз при старте приложения.
 */
export async function initGunBackup(peers: string[] = []): Promise<void> {
  if (gunInstance) return;
  try {
    const Gun = (await import('gun')).default;
    // IndexedDB адаптер встроен в Gun по умолчанию в браузере
    gunInstance = Gun({ peers, localStorage: false }) as unknown as GunInstance;
  } catch {
    console.warn('[gun-backup] Failed to initialize Gun.js');
  }
}

/**
 * Сохраняет граф связей (2 уровня) в локальное хранилище через Gun.js.
 */
export async function syncToLocal(data: GraphBackup): Promise<void> {
  if (!gunInstance) {
    // Fallback: IndexedDB напрямую
    await saveToIndexedDB(data);
    return;
  }

  const userNode = gunInstance.get('so-backup').get(data.userId);
  userNode.put({
    userId: data.userId,
    syncedAt: data.syncedAt,
    connectionsJson: JSON.stringify(data.connections),
    level2Json: JSON.stringify(data.level2),
  });
}

/**
 * Читает кэшированный граф из локального хранилища.
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
          connections: JSON.parse(String(d['connectionsJson'] ?? '[]')),
          level2: JSON.parse(String(d['level2Json'] ?? '{}')),
          syncedAt: String(d['syncedAt'] ?? ''),
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/* ---------- Fallback: IndexedDB напрямую (без Gun.js) ---------- */

const DB_NAME = 'so-graph-backup';
const STORE_NAME = 'graph';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' });
      }
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

export type { GraphBackup, ConnectionData };
