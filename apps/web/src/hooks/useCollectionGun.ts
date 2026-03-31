import { useState, useEffect, useRef } from 'react';
import type { CollectionDetails, PaymentConfirmation } from '@so/gun-backup';

/**
 * Real-time p2p coordination channel for a collection.
 * Data is relayed via Gun.js and never stored in the app database.
 * Activates only when collection is active (status ACTIVE or BLOCKED).
 */
export function useCollectionGun(collectionId: string | undefined, active: boolean) {
  const [details, setDetails] = useState<CollectionDetails | null>(null);
  const [confirmations, setConfirmations] = useState<PaymentConfirmation[]>([]);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!collectionId || !active || initialized.current) return;
    initialized.current = true;

    import('@so/gun-backup').then((m) => {
      setReady(true);
      m.onCollectionDetails(collectionId, setDetails);
      m.onConfirmations(collectionId, setConfirmations);
    }).catch(() => {});
  }, [collectionId, active]);

  const saveDetails = async (text: string) => {
    if (!collectionId) return;
    const m = await import('@so/gun-backup');
    await m.setCollectionDetails(collectionId, text);
  };

  const confirm = async (userId: string, userName: string, amount: number) => {
    if (!collectionId) return;
    const m = await import('@so/gun-backup');
    await m.confirmPayment(collectionId, userId, userName, amount);
  };

  const clear = async () => {
    if (!collectionId) return;
    const m = await import('@so/gun-backup');
    await m.clearCollectionData(collectionId);
  };

  return { details, confirmations, ready, saveDetails, confirm, clear };
}
