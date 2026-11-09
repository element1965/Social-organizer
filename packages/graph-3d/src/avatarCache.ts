import * as THREE from 'three';

/**
 * Avatar textures shared by every NetworkGraph. They outlive unmount.
 * A texture is disposed only when the LRU drops it and no mounted graph still holds the URL.
 */

const AVATAR_CACHE_MAX = 150;
const PHOTO_FAIL_MS = 10 * 60 * 1000;
const PHOTO_CONCURRENCY = 6;
const PHOTO_SIZE = 128;

interface AvatarEntry {
  url: string;
  tex: THREE.CanvasTexture;
  lastUsed: number;
}

const avatarCache = new Map<string, AvatarEntry>();
const avatarPins = new Map<string, number>();
const avatarFailed = new Map<string, number>();
const avatarListeners = new Map<string, Set<(tex: THREE.Texture) => void>>();
const avatarQueue: string[] = [];
const avatarQueued = new Set<string>();
const avatarInflight = new Set<string>();
let avatarActive = 0;

export interface AvatarClient {
  hold(url: string): void;
  peek(url: string): THREE.Texture | null;
  request(url: string, nodeId: string): void;
  pump(apply: (nodeId: string, tex: THREE.Texture, url: string) => void): void;
  release(): void;
}

function photoSrc(url: string): string {
  if (
    url.startsWith('/')
    || url.startsWith('data:')
    || url.startsWith('blob:')
    || url.startsWith(window.location.origin)
  ) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

function failFresh(url: string): boolean {
  const at = avatarFailed.get(url);
  return at != null && Date.now() - at < PHOTO_FAIL_MS;
}

function touch(url: string): THREE.Texture | null {
  const entry = avatarCache.get(url);
  if (!entry) return null;
  entry.lastUsed = Date.now();
  avatarCache.delete(url);
  avatarCache.set(url, entry);
  return entry.tex;
}

function evictAvatars() {
  if (avatarCache.size <= AVATAR_CACHE_MAX) return;
  const free: AvatarEntry[] = [];
  for (const entry of avatarCache.values()) {
    if ((avatarPins.get(entry.url) ?? 0) === 0) free.push(entry);
  }
  free.sort((a, b) => a.lastUsed - b.lastUsed);
  let extra = avatarCache.size - AVATAR_CACHE_MAX;
  for (const entry of free) {
    if (extra <= 0) break;
    entry.tex.dispose();
    avatarCache.delete(entry.url);
    extra--;
  }
}

function storeAvatar(url: string, tex: THREE.CanvasTexture) {
  const prev = avatarCache.get(url);
  if (prev) {
    if (prev.tex !== tex) prev.tex.dispose();
    prev.tex = tex;
  }
  const entry: AvatarEntry = prev ?? { url, tex, lastUsed: 0 };
  entry.lastUsed = Date.now();
  avatarCache.delete(url);
  avatarCache.set(url, entry);
  evictAvatars();
}

function subscribe(url: string, fn: (tex: THREE.Texture) => void): () => void {
  let set = avatarListeners.get(url);
  if (!set) {
    set = new Set();
    avatarListeners.set(url, set);
  }
  set.add(fn);
  return () => {
    const cur = avatarListeners.get(url);
    if (!cur) return;
    cur.delete(fn);
    if (cur.size === 0) avatarListeners.delete(url);
  };
}

function publish(url: string, tex: THREE.Texture) {
  const set = avatarListeners.get(url);
  if (!set) return;
  for (const fn of [...set]) fn(tex);
}

function drawCircle(source: CanvasImageSource): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('avatar canvas');
  ctx.beginPath();
  ctx.arc(PHOTO_SIZE / 2, PHOTO_SIZE / 2, PHOTO_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(source, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (typeof img.decode !== 'function') {
        resolve(img);
        return;
      }
      img.decode().then(() => resolve(img)).catch(reject);
    };
    img.onerror = () => reject(new Error('avatar image'));
    img.src = src;
  });
}

async function bitmapOf(source: ImageBitmapSource): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(source);
  } catch {
    return null;
  }
}

/** Decode off the main thread when the browser can, then stamp a circle into the canvas. */
async function loadCircleTexture(src: string): Promise<THREE.CanvasTexture> {
  if (src.startsWith('data:')) {
    const img = await loadImage(src);
    const bitmap = await bitmapOf(img);
    try {
      return drawCircle(bitmap ?? img);
    } finally {
      bitmap?.close();
    }
  }
  const response = await fetch(src);
  if (!response.ok) throw new Error(`avatar ${response.status}`);
  const blob = await response.blob();
  const bitmap = await bitmapOf(blob);
  if (bitmap) {
    try {
      return drawCircle(bitmap);
    } finally {
      bitmap.close();
    }
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImage(objectUrl);
    return drawCircle(img);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function pumpQueue() {
  while (avatarActive < PHOTO_CONCURRENCY && avatarQueue.length > 0) {
    const url = avatarQueue.shift();
    if (!url) break;
    avatarQueued.delete(url);
    const hit = avatarCache.get(url);
    if (hit) {
      publish(url, hit.tex);
      continue;
    }
    if (avatarInflight.has(url) || failFresh(url)) continue;
    avatarFailed.delete(url);
    avatarInflight.add(url);
    avatarActive++;
    void loadCircleTexture(photoSrc(url)).then(
      (tex) => {
        avatarActive--;
        avatarInflight.delete(url);
        storeAvatar(url, tex);
        publish(url, tex);
        pumpQueue();
      },
      () => {
        avatarActive--;
        avatarInflight.delete(url);
        avatarFailed.set(url, Date.now());
        pumpQueue();
      },
    );
  }
}

function enqueue(url: string) {
  const hit = avatarCache.get(url);
  if (hit) {
    publish(url, hit.tex);
    return;
  }
  if (avatarInflight.has(url) || avatarQueued.has(url) || failFresh(url)) return;
  avatarFailed.delete(url);
  avatarQueued.add(url);
  avatarQueue.push(url);
  pumpQueue();
}

export function createAvatarClient(): AvatarClient {
  const held = new Set<string>();
  const waiting = new Map<string, Set<string>>();
  const unsubs = new Map<string, () => void>();
  const ready: Array<{ nodeId: string; tex: THREE.Texture; url: string }> = [];
  const readyKeys = new Set<string>();
  let released = false;

  const pin = (url: string) => {
    if (released || held.has(url)) return;
    held.add(url);
    avatarPins.set(url, (avatarPins.get(url) ?? 0) + 1);
  };

  const pushReady = (nodeId: string, tex: THREE.Texture, url: string) => {
    if (released) return;
    const key = `${nodeId}\0${url}`;
    if (readyKeys.has(key)) return;
    readyKeys.add(key);
    ready.push({ nodeId, tex, url });
  };

  return {
    hold: pin,
    peek(url: string) {
      return touch(url);
    },
    request(url: string, nodeId: string) {
      if (released || !url) return;
      const hit = touch(url);
      if (hit) {
        pin(url);
        pushReady(nodeId, hit, url);
        return;
      }
      if (failFresh(url)) return;
      pin(url);
      let ids = waiting.get(url);
      if (!ids) {
        ids = new Set();
        waiting.set(url, ids);
        unsubs.set(url, subscribe(url, (tex) => {
          const set = waiting.get(url);
          waiting.delete(url);
          const unsub = unsubs.get(url);
          unsubs.delete(url);
          unsub?.();
          if (!set) return;
          for (const id of set) pushReady(id, tex, url);
        }));
      }
      if (!ids.has(nodeId)) ids.add(nodeId);
      // Already waiting: still kick the queue so a failure older than 10 minutes can retry once.
      enqueue(url);
    },
    pump(apply) {
      if (released) return;
      while (ready.length > 0) {
        const item = ready.shift();
        if (!item) break;
        readyKeys.delete(`${item.nodeId}\0${item.url}`);
        apply(item.nodeId, item.tex, item.url);
      }
    },
    release() {
      if (released) return;
      released = true;
      for (const unsub of unsubs.values()) unsub();
      unsubs.clear();
      waiting.clear();
      ready.length = 0;
      readyKeys.clear();
      for (const url of held) {
        const next = (avatarPins.get(url) ?? 1) - 1;
        if (next <= 0) avatarPins.delete(url);
        else avatarPins.set(url, next);
      }
      held.clear();
      evictAvatars();
    },
  };
}
