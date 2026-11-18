import { storeLinks, type StoreLinks } from '../../lib/device';

/** The invite a guest came with (`?invite=` or one saved earlier), so store links can carry it. */
export function usePendingInvite(explicit?: string | null): string | null {
  if (explicit) return explicit;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('invite');
    return fromUrl || localStorage.getItem('pendingInviteToken');
  } catch {
    return null;
  }
}

export function useStoreLinks(invite?: string | null): StoreLinks {
  return storeLinks(usePendingInvite(invite));
}
