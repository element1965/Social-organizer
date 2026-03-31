import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, Check, Pencil, Loader2, Users } from 'lucide-react';
import { useCollectionGun } from '../hooks/useCollectionGun';
import type { PaymentConfirmation } from '@so/gun-backup';

interface Props {
  collectionId: string;
  isOwner: boolean;
  isParticipant: boolean; // has an obligation
  myUserId: string;
  myName: string;
  myObligationAmount?: number; // USD amount user pledged
  active: boolean; // collection status is ACTIVE or BLOCKED
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин. назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} д. назад`;
}

export function CollectionCoordPanel({
  collectionId, isOwner, isParticipant, myUserId, myName, myObligationAmount, active,
}: Props) {
  const { details, confirmations, ready, saveDetails, confirm } = useCollectionGun(
    collectionId,
    active && (isOwner || isParticipant),
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!active || (!isOwner && !isParticipant)) return null;

  const myConfirmation = confirmations.find((c) => c.userId === myUserId);

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    await saveDetails(draft.trim());
    setSaving(false);
    setEditing(false);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    await confirm(myUserId, myName, myObligationAmount ?? 0);
    setConfirming(false);
  };

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
      {/* Header — toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-100/50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Координация платежа
          </span>
          {!ready && (
            <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
          )}
          {confirmations.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 font-medium">
              {confirmations.length} подтв.
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-blue-200/50 dark:border-blue-800/50 pt-3">

          {/* Notice */}
          <p className="text-[11px] text-blue-600/70 dark:text-blue-400/70 leading-relaxed">
            Данные передаются p2p и не хранятся в базе. Исчезнут после закрытия сбора.
          </p>

          {/* Payment details block */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Реквизиты для перевода
              </span>
              {isOwner && !editing && (
                <button
                  onClick={() => { setDraft(details?.text ?? ''); setEditing(true); }}
                  className="flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <Pencil className="w-3 h-3" />
                  {details?.text ? 'Изменить' : 'Добавить'}
                </button>
              )}
            </div>

            {isOwner && editing ? (
              <div className="space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Карта, крипто-кошелёк, PayPal, Wise..."
                  rows={4}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:outline-none focus:border-blue-500"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !draft.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Сохранить
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : details?.text ? (
              <div className="p-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">
                  {details.text}
                </p>
                {details.updatedAt && (
                  <p className="text-[10px] text-gray-400 mt-1.5">{timeAgo(details.updatedAt)}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
                {isOwner ? 'Укажите реквизиты для перевода' : 'Организатор ещё не добавил реквизиты'}
              </p>
            )}
          </div>

          {/* Confirm payment — for participants only */}
          {isParticipant && !isOwner && (
            <div>
              {myConfirmation ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300">
                      Вы подтвердили перевод
                      {myObligationAmount ? ` $${myObligationAmount}` : ''}
                    </p>
                    <p className="text-[10px] text-green-600/70 dark:text-green-400/70">
                      {timeAgo(myConfirmation.confirmedAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={confirming || !details?.text}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                >
                  {confirming
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Check className="w-4 h-4" />}
                  Подтвердить перевод{myObligationAmount ? ` $${myObligationAmount}` : ''}
                </button>
              )}
            </div>
          )}

          {/* Confirmations list — for owner */}
          {isOwner && confirmations.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Подтверждённые переводы ({confirmations.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {confirmations.map((c: PaymentConfirmation) => (
                  <div
                    key={c.userId}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" />
                      <span className="text-xs text-gray-900 dark:text-white">{c.userName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-medium text-green-700 dark:text-green-300">
                        ${c.amount}
                      </span>
                      <p className="text-[10px] text-gray-400">{timeAgo(c.confirmedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
