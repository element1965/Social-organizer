import { useState, useEffect } from 'react';
import { X, Send, Loader2, Clock, Link2, Trash2, ToggleLeft, ToggleRight, BarChart3, Pencil, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { MessageComposer, type MessageData } from './MessageComposer';

interface BroadcastPanelProps {
  onClose: () => void;
}

type Tab = 'send' | 'scheduled' | 'autochain';
type Variant = 'all' | 'invited' | 'organic';

const emptyMessage: MessageData = { text: '', mediaType: 'text' };

const inputCls = 'w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500';

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    SENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  const key = `broadcast.status${status.charAt(0) + status.slice(1).toLowerCase()}`;
  return (
    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[status] || 'bg-gray-100'}`}>
      {t(key)}
    </span>
  );
}

function VariantBadge({ variant }: { variant: string }) {
  const { t } = useTranslation();
  if (variant === 'all') return null;
  const colors: Record<string, string> = {
    invited: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    organic: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  };
  const labels: Record<string, string> = {
    invited: t('broadcast.variantInvited'),
    organic: t('broadcast.variantOrganic'),
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[variant] || ''}`}>
      {labels[variant] || variant}
    </span>
  );
}

function VariantSelector({ value, onChange, disabled }: { value: Variant; onChange: (v: Variant) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const opts: { key: Variant; label: string }[] = [
    { key: 'all', label: t('broadcast.variantAll') },
    { key: 'invited', label: t('broadcast.variantInvited') },
    { key: 'organic', label: t('broadcast.variantOrganic') },
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          disabled={disabled}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            value === o.key
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BroadcastPanel({ onClose }: BroadcastPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('send');
  const [mode, setMode] = useState<'all' | 'direct'>('all');
  const [telegramId, setTelegramId] = useState('');
  const [msg, setMsg] = useState<MessageData>({ ...emptyMessage });
  const [result, setResult] = useState<string | null>(null);

  // --- Send tab ---
  const sendAllMutation = trpc.broadcast.sendAll.useMutation({
    onSuccess: (data) => setResult(t('broadcast.sentSuccess', { count: data.sent })),
    onError: () => setResult(t('broadcast.error')),
  });
  const sendDirectMutation = trpc.broadcast.sendDirect.useMutation({
    onSuccess: () => setResult(t('broadcast.directSuccess')),
    onError: () => setResult(t('broadcast.error')),
  });

  const handleSend = () => {
    if (!msg.text.trim()) return;
    setResult(null);
    if (mode === 'all') {
      sendAllMutation.mutate({
        text: msg.text.trim(),
        mediaType: msg.mediaType,
        mediaUrl: !msg.mediaFileId ? msg.mediaUrl?.trim() || undefined : undefined,
        mediaFileId: msg.mediaFileId || undefined,
        buttonUrl: msg.buttonUrl?.trim() || undefined,
        buttonText: msg.buttonText?.trim() || undefined,
      });
    } else {
      if (!telegramId.trim()) return;
      sendDirectMutation.mutate({ telegramId: telegramId.trim(), text: msg.text.trim() });
    }
  };

  // --- Scheduled tab ---
  const [scheduledMsg, setScheduledMsg] = useState<MessageData>({ ...emptyMessage });
  const [scheduledAt, setScheduledAt] = useState('');
  const scheduledList = trpc.broadcast.listScheduled.useQuery(undefined, { enabled: tab === 'scheduled' });
  const scheduleMutation = trpc.broadcast.schedulePost.useMutation({
    onSuccess: () => {
      setResult(t('broadcast.scheduledSuccess'));
      setScheduledMsg({ ...emptyMessage });
      setScheduledAt('');
      scheduledList.refetch();
    },
    onError: () => setResult(t('broadcast.error')),
  });
  const cancelMutation = trpc.broadcast.cancelScheduled.useMutation({
    onSuccess: () => {
      setResult(t('broadcast.cancelledSuccess'));
      scheduledList.refetch();
    },
    onError: () => setResult(t('broadcast.error')),
  });

  const handleSchedule = () => {
    if (!scheduledMsg.text.trim() || !scheduledAt) return;
    setResult(null);
    scheduleMutation.mutate({
      text: scheduledMsg.text.trim(),
      mediaType: scheduledMsg.mediaType,
      mediaUrl: !scheduledMsg.mediaFileId ? scheduledMsg.mediaUrl?.trim() || undefined : undefined,
      mediaFileId: scheduledMsg.mediaFileId || undefined,
      buttonUrl: scheduledMsg.buttonUrl?.trim() || undefined,
      buttonText: scheduledMsg.buttonText?.trim() || undefined,
      scheduledAt,
    });
  };

  // --- Auto-chain tab ---
  const [chainMsg, setChainMsg] = useState<MessageData>({ ...emptyMessage });
  const [chainDay, setChainDay] = useState(0);
  const [chainOrder, setChainOrder] = useState(0);
  const [chainInterval, setChainInterval] = useState(120);
  const [chainVariant, setChainVariant] = useState<Variant>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editDay, setEditDay] = useState(0);
  const [editOrder, setEditOrder] = useState(0);
  const [editInterval, setEditInterval] = useState(120);
  const [editVariant, setEditVariant] = useState<Variant>('all');

  const chainList = trpc.broadcast.listChainMessages.useQuery(undefined, { enabled: tab === 'autochain' });
  const chainStatsQuery = trpc.broadcast.chainStats.useQuery(undefined, { enabled: tab === 'autochain' });
  const createChainMutation = trpc.broadcast.createChainMessage.useMutation({
    onSuccess: () => {
      setResult(t('broadcast.chainAdded'));
      setChainMsg({ ...emptyMessage });
      setChainDay(0);
      setChainOrder(0);
      setChainVariant('all');
      chainList.refetch();
      chainStatsQuery.refetch();
    },
    onError: () => setResult(t('broadcast.error')),
  });
  const updateChainMutation = trpc.broadcast.updateChainMessage.useMutation({
    onSuccess: () => {
      setEditingId(null);
      chainList.refetch();
      chainStatsQuery.refetch();
    },
  });
  const deleteChainMutation = trpc.broadcast.deleteChainMessage.useMutation({
    onSuccess: () => { chainList.refetch(); chainStatsQuery.refetch(); },
  });

  const handleAddChain = () => {
    if (!chainMsg.text.trim()) return;
    setResult(null);
    createChainMutation.mutate({
      text: chainMsg.text.trim(),
      mediaType: chainMsg.mediaType,
      mediaUrl: !chainMsg.mediaFileId ? chainMsg.mediaUrl?.trim() || undefined : undefined,
      mediaFileId: chainMsg.mediaFileId || undefined,
      buttonUrl: chainMsg.buttonUrl?.trim() || undefined,
      buttonText: chainMsg.buttonText?.trim() || undefined,
      dayOffset: chainDay,
      sortOrder: chainOrder,
      intervalMin: chainInterval,
      variant: chainVariant,
    });
  };

  const startEdit = (cm: { id: string; text: string; dayOffset: number; sortOrder: number; intervalMin: number; variant: string }) => {
    setEditingId(cm.id);
    setEditText(cm.text);
    setEditDay(cm.dayOffset);
    setEditOrder(cm.sortOrder);
    setEditInterval(cm.intervalMin);
    setEditVariant((cm.variant || 'all') as Variant);
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) return;
    updateChainMutation.mutate({
      id: editingId,
      text: editText.trim(),
      dayOffset: editDay,
      sortOrder: editOrder,
      intervalMin: editInterval,
      variant: editVariant,
    });
  };

  // Mark read on mount
  const markRead = trpc.broadcast.markRead.useMutation();
  useEffect(() => { markRead.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = sendAllMutation.isPending || sendDirectMutation.isPending
    || scheduleMutation.isPending || createChainMutation.isPending;

  const tabCls = (t: Tab) => `flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${
    tab === t ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
  }`;

  return (
    <div className="fixed inset-x-4 bottom-20 max-h-[75vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Send className="w-5 h-5 text-emerald-500" />
          {t('broadcast.title')}
        </h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 px-4">
        <button onClick={() => { setTab('send'); setResult(null); }} className={tabCls('send')}>{t('broadcast.tabSend')}</button>
        <button onClick={() => { setTab('scheduled'); setResult(null); }} className={tabCls('scheduled')}>{t('broadcast.tabScheduled')}</button>
        <button onClick={() => { setTab('autochain'); setResult(null); }} className={tabCls('autochain')}>{t('broadcast.tabAutoChain')}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* === SEND TAB === */}
        {tab === 'send' && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('all')}
                className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                  mode === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('broadcast.allUsers')}
              </button>
              <button
                onClick={() => setMode('direct')}
                className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
                  mode === 'direct' ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('broadcast.directUser')}
              </button>
            </div>

            {mode === 'direct' && (
              <input
                value={telegramId}
                onChange={(e) => setTelegramId(e.target.value)}
                placeholder={t('broadcast.telegramIdPlaceholder')}
                className={inputCls}
              />
            )}

            {mode === 'all' ? (
              <MessageComposer value={msg} onChange={setMsg} disabled={isPending} />
            ) : (
              <textarea
                value={msg.text}
                onChange={(e) => setMsg({ ...msg, text: e.target.value })}
                placeholder={t('broadcast.messagePlaceholder')}
                className={`${inputCls} resize-y`}
                rows={3}
              />
            )}
          </>
        )}

        {/* === SCHEDULED TAB === */}
        {tab === 'scheduled' && (
          <>
            <MessageComposer value={scheduledMsg} onChange={setScheduledMsg} disabled={isPending} />

            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                {t('broadcast.scheduledAt')}
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={inputCls}
                disabled={isPending}
              />
            </div>

            {/* Schedule button */}
            <button
              onClick={handleSchedule}
              disabled={!scheduledMsg.text.trim() || !scheduledAt || isPending}
              className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              {scheduleMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t('broadcast.scheduling')}</>
              ) : (
                <><Clock className="w-4 h-4" />{t('broadcast.schedule')}</>
              )}
            </button>

            {/* Scheduled posts list */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
              {scheduledList.data?.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">{t('broadcast.noScheduled')}</p>
              )}
              {scheduledList.data?.map((post) => (
                <div key={post.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{post.text}</p>
                    <StatusBadge status={post.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      {post.sentCount != null && (
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          {post._count.deliveries} / {(post.deliveries as unknown[]).length} {t('broadcast.reads')}
                        </span>
                      )}
                      {post.status === 'PENDING' && (
                        <button
                          onClick={() => cancelMutation.mutate({ id: post.id })}
                          disabled={cancelMutation.isPending}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          {t('broadcast.cancelPost')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* === AUTO-CHAIN TAB === */}
        {tab === 'autochain' && (
          <>
            {/* Stats */}
            {chainStatsQuery.data && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg font-bold text-emerald-600">{chainStatsQuery.data.activeMessages}</div>
                  <div className="text-xs text-gray-500">{t('broadcast.activeMessages')}</div>
                </div>
                <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg font-bold text-blue-600">{chainStatsQuery.data.totalDeliveries}</div>
                  <div className="text-xs text-gray-500">{t('broadcast.totalDeliveries')}</div>
                </div>
                <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className="text-lg font-bold text-purple-600">{chainStatsQuery.data.openRate}%</div>
                  <div className="text-xs text-gray-500">{t('broadcast.openRate')}</div>
                </div>
              </div>
            )}

            {/* Add form */}
            <MessageComposer value={chainMsg} onChange={setChainMsg} disabled={isPending} />

            {/* Variant selector */}
            <VariantSelector value={chainVariant} onChange={setChainVariant} disabled={isPending} />

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('broadcast.chainDayOffset')}</label>
                <input
                  type="number"
                  min={0}
                  value={chainDay}
                  onChange={(e) => setChainDay(Number(e.target.value))}
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('broadcast.chainSortOrder')}</label>
                <input
                  type="number"
                  min={0}
                  value={chainOrder}
                  onChange={(e) => setChainOrder(Number(e.target.value))}
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">{t('broadcast.chainInterval')}</label>
                <input
                  type="number"
                  min={1}
                  value={chainInterval}
                  onChange={(e) => setChainInterval(Number(e.target.value))}
                  className={inputCls}
                  disabled={isPending}
                />
              </div>
            </div>

            <button
              onClick={handleAddChain}
              disabled={!chainMsg.text.trim() || isPending}
              className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
            >
              {createChainMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />{t('broadcast.adding')}</>
              ) : (
                <><Link2 className="w-4 h-4" />{t('broadcast.addChainMessage')}</>
              )}
            </button>

            {/* Chain messages list */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
              {chainList.data?.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">{t('broadcast.noChainMessages')}</p>
              )}
              {chainList.data?.map((cm) => (
                <div key={cm.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-1.5">
                  {editingId === cm.id ? (
                    /* --- Edit mode --- */
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className={`${inputCls} resize-y`}
                        rows={3}
                      />
                      <VariantSelector value={editVariant} onChange={setEditVariant} />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">{t('broadcast.chainDayOffset')}</label>
                          <input type="number" min={0} value={editDay} onChange={(e) => setEditDay(Number(e.target.value))} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">{t('broadcast.chainSortOrder')}</label>
                          <input type="number" min={0} value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))} className={inputCls} />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">{t('broadcast.chainInterval')}</label>
                          <input type="number" min={1} value={editInterval} onChange={(e) => setEditInterval(Number(e.target.value))} className={inputCls} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={updateChainMutation.isPending || !editText.trim()}
                          className="flex-1 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />{t('common.save')}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* --- View mode --- */
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              {t('broadcast.chainDay', { day: cm.dayOffset })}
                            </span>
                            <span className="text-xs text-gray-400">#{cm.sortOrder}</span>
                            {cm.mediaType !== 'text' && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                {cm.mediaType}
                              </span>
                            )}
                            <VariantBadge variant={cm.variant} />
                          </div>
                          <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">{cm.text}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-3">
                          <span>{t('broadcast.deliveries')}: {cm._count.deliveries}</span>
                          <span>{t('broadcast.reads')}: {(cm.deliveries as unknown[]).length}</span>
                          {cm._count.deliveries > 0 && (
                            <span className="text-purple-500">
                              {Math.round(((cm.deliveries as unknown[]).length / cm._count.deliveries) * 100)}% {t('broadcast.openRate')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(cm)}
                            className="text-blue-400 hover:text-blue-600"
                            title={t('broadcast.editChain')}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateChainMutation.mutate({ id: cm.id, isActive: !cm.isActive })}
                            className="flex items-center gap-0.5"
                            title={cm.isActive ? t('broadcast.active') : t('broadcast.inactive')}
                          >
                            {cm.isActive ? (
                              <ToggleRight className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => { if (confirm(t('common.confirm') + '?')) deleteChainMutation.mutate({ id: cm.id }); }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Result message */}
        {result && (
          <p className={`text-sm text-center py-1 ${result.includes('Failed') || result.includes('ошибка') || result.includes('Ошибка') ? 'text-red-500' : 'text-emerald-500'}`}>
            {result}
          </p>
        )}
      </div>

      {/* Send button (only for send tab) */}
      {tab === 'send' && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleSend}
            disabled={!msg.text.trim() || isPending || (mode === 'direct' && !telegramId.trim())}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          >
            {(sendAllMutation.isPending || sendDirectMutation.isPending) ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{t('broadcast.sending')}</>
            ) : (
              <><Send className="w-4 h-4" />{t('broadcast.send')}</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
