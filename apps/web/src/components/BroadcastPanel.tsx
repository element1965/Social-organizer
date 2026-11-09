import { useEffect, useState } from 'react';
import { BarChart3, Check, Clock, Link2, Pencil, Play, Send, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc, authFetch } from '../lib/trpc';
import { Button } from './ui2/Button';
import { Pill, type PillTone } from './ui2/Pill';
import { Segmented } from './ui2/Segmented';
import { Sheet } from './ui2/Sheet';
import { MessageComposer, type MessageData } from './MessageComposer';
import { cn } from '../lib/utils';

type Tab = 'send' | 'scheduled' | 'autochain';
type Variant = 'all' | 'invited' | 'organic';

const emptyMessage: MessageData = { text: '', mediaType: 'text' };

const fieldCls =
  'w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-body-s font-semibold text-ink outline-none placeholder:text-ink-subtle focus:border-care disabled:opacity-50';

const STATUS_TONE: Record<string, PillTone> = {
  PENDING: 'warm',
  SENT: 'care',
  CANCELLED: 'neutral',
  FAILED: 'sos',
};

const STATUS_KEY: Record<string, string> = {
  PENDING: 'broadcast.statusPending',
  SENT: 'broadcast.statusSent',
  CANCELLED: 'broadcast.statusCancelled',
  FAILED: 'broadcast.statusFailed',
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = STATUS_KEY[status];
  return <Pill tone={STATUS_TONE[status] ?? 'neutral'}>{key ? t(key) : status}</Pill>;
}

function VariantBadge({ variant }: { variant: string }) {
  const { t } = useTranslation();
  if (variant === 'all') return null;
  const tone: PillTone = variant === 'invited' ? 'warm' : 'link';
  const label = variant === 'invited'
    ? t('broadcast.variantInvited')
    : variant === 'organic'
      ? t('broadcast.variantOrganic')
      : variant;
  return <Pill tone={tone}>{label}</Pill>;
}

function VariantSelector({ value, onChange, disabled }: { value: Variant; onChange: (v: Variant) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Segmented
      label={t('broadcast.variantAll')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: t('broadcast.variantAll'), disabled },
        { value: 'invited', label: t('broadcast.variantInvited'), disabled },
        { value: 'organic', label: t('broadcast.variantOrganic'), disabled },
      ]}
    />
  );
}

function NumField({
  label,
  value,
  min,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label font-semibold text-ink-muted">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={fieldCls}
        disabled={disabled}
      />
    </label>
  );
}

export function BroadcastPanel() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('send');
  const [msg, setMsg] = useState<MessageData>({ ...emptyMessage });
  const [result, setResult] = useState<string | null>(null);
  const [resultError, setResultError] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const note = (text: string, error = false) => {
    setResult(text);
    setResultError(error);
  };

  const sendAllMutation = trpc.broadcast.sendAll.useMutation({
    onSuccess: (data) => note(t('broadcast.sentSuccess', { count: data.sent })),
    onError: () => note(t('broadcast.error'), true),
  });

  const handleSend = () => {
    if (!msg.text.trim()) return;
    setResult(null);
    sendAllMutation.mutate({
      text: msg.text.trim(),
      mediaType: msg.mediaType,
      mediaUrl: !msg.mediaFileId ? msg.mediaUrl?.trim() || undefined : undefined,
      mediaFileId: msg.mediaFileId || undefined,
      buttonUrl: msg.buttonUrl?.trim() || undefined,
      buttonText: msg.buttonText?.trim() || undefined,
    });
  };

  const [scheduledMsg, setScheduledMsg] = useState<MessageData>({ ...emptyMessage });
  const [scheduledAt, setScheduledAt] = useState('');
  const scheduledList = trpc.broadcast.listScheduled.useQuery(undefined, { enabled: tab === 'scheduled' });
  const scheduleMutation = trpc.broadcast.schedulePost.useMutation({
    onSuccess: () => {
      note(t('broadcast.scheduledSuccess'));
      setScheduledMsg({ ...emptyMessage });
      setScheduledAt('');
      scheduledList.refetch();
    },
    onError: () => note(t('broadcast.error'), true),
  });
  const cancelMutation = trpc.broadcast.cancelScheduled.useMutation({
    onSuccess: () => {
      note(t('broadcast.cancelledSuccess'));
      scheduledList.refetch();
    },
    onError: () => note(t('broadcast.error'), true),
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [triggerLoading, setTriggerLoading] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const chainList = trpc.broadcast.listChainMessages.useQuery(undefined, { enabled: tab === 'autochain' });
  const chainStatsQuery = trpc.broadcast.chainStats.useQuery(undefined, { enabled: tab === 'autochain' });
  const createChainMutation = trpc.broadcast.createChainMessage.useMutation({
    onSuccess: () => {
      note(t('broadcast.chainAdded'));
      setChainMsg({ ...emptyMessage });
      setChainDay(0);
      setChainOrder(0);
      setChainVariant('all');
      chainList.refetch();
      chainStatsQuery.refetch();
    },
    onError: () => note(t('broadcast.error'), true),
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

  const markRead = trpc.broadcast.markRead.useMutation();
  useEffect(() => { markRead.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = sendAllMutation.isPending
    || scheduleMutation.isPending || createChainMutation.isPending;

  return (
    <div className="space-y-3 pb-4">
      <Segmented
        label={t('broadcast.title')}
        value={tab}
        onChange={(next) => { setTab(next); setResult(null); }}
        options={[
          { value: 'send', label: t('broadcast.tabSend') },
          { value: 'scheduled', label: t('broadcast.tabScheduled') },
          { value: 'autochain', label: t('broadcast.tabAutoChain') },
        ]}
      />

      {tab === 'send' && (
        <>
          <MessageComposer value={msg} onChange={setMsg} disabled={isPending} />
          <Button className="w-full" onClick={handleSend} disabled={!msg.text.trim()} loading={sendAllMutation.isPending} icon={<Send className="h-4 w-4" />}>
            {sendAllMutation.isPending ? t('broadcast.sending') : t('broadcast.send')}
          </Button>
        </>
      )}

      {tab === 'scheduled' && (
        <>
          <MessageComposer value={scheduledMsg} onChange={setScheduledMsg} disabled={isPending} />
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-label font-semibold text-ink-muted">
              <Clock className="h-3.5 w-3.5" />
              {t('broadcast.scheduledAt')}
            </span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={fieldCls}
              disabled={isPending}
            />
          </label>
          <Button
            className="w-full"
            onClick={handleSchedule}
            disabled={!scheduledMsg.text.trim() || !scheduledAt}
            loading={scheduleMutation.isPending}
            icon={<Clock className="h-4 w-4" />}
          >
            {scheduleMutation.isPending ? t('broadcast.scheduling') : t('broadcast.schedule')}
          </Button>
          <div className="space-y-2 border-t border-line pt-3">
            {scheduledList.data?.length === 0 && (
              <p className="py-2 text-center text-label font-semibold text-ink-subtle">{t('broadcast.noScheduled')}</p>
            )}
            {scheduledList.data?.map((post) => (
              <div key={post.id} className="space-y-1.5 rounded-lg bg-surface p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <p
                    onClick={() => toggleExpand(post.id)}
                    className={cn(
                      'cursor-pointer whitespace-pre-wrap text-body-s text-ink',
                      expandedIds.has(post.id) ? '' : 'line-clamp-2',
                    )}
                  >{post.text}</p>
                  <StatusBadge status={post.status} />
                </div>
                <div className="flex items-center justify-between text-label font-semibold text-ink-muted">
                  <span>{new Date(post.scheduledAt).toLocaleString()}</span>
                  <div className="flex items-center gap-2">
                    {post.sentCount != null && (
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {post._count.deliveries} / {(post.deliveries as unknown[]).length} {t('broadcast.reads')}
                      </span>
                    )}
                    {post.status === 'PENDING' && (
                      <Button
                        variant="textDanger"
                        size="sm"
                        onClick={() => cancelMutation.mutate({ id: post.id })}
                        disabled={cancelMutation.isPending}
                      >
                        {t('broadcast.cancelPost')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'autochain' && (
        <>
          {chainStatsQuery.data && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface p-2 shadow-card">
                <div className="text-h3 font-bold text-care">{chainStatsQuery.data.activeMessages}</div>
                <div className="text-label font-semibold text-ink-muted">{t('broadcast.activeMessages')}</div>
              </div>
              <div className="rounded-lg bg-surface p-2 shadow-card">
                <div className="text-h3 font-bold text-link">{chainStatsQuery.data.totalDeliveries}</div>
                <div className="text-label font-semibold text-ink-muted">{t('broadcast.totalDeliveries')}</div>
              </div>
              <div className="rounded-lg bg-surface p-2 shadow-card">
                <div className="text-h3 font-bold text-warm-ink">{chainStatsQuery.data.openRate}%</div>
                <div className="text-label font-semibold text-ink-muted">{t('broadcast.openRate')}</div>
              </div>
            </div>
          )}

          <Button
            variant="secondary"
            className="w-full"
            disabled={triggerLoading}
            loading={triggerLoading}
            icon={<Play className="h-4 w-4" />}
            onClick={async () => {
              setTriggerLoading(true);
              setResult(null);
              try {
                const token = localStorage.getItem('accessToken');
                const res = await authFetch('/api/trigger-autochain', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  note(t('broadcast.triggerSuccess'));
                  chainStatsQuery.refetch();
                } else {
                  const body = await res.json().catch(() => ({})) as { error?: string };
                  note(`${t('broadcast.triggerError')}: ${body.error || res.status}`, true);
                }
              } catch {
                note(t('broadcast.triggerError'), true);
              } finally {
                setTriggerLoading(false);
              }
            }}
          >
            {triggerLoading ? t('broadcast.triggering') : t('broadcast.triggerNow')}
          </Button>

          <MessageComposer value={chainMsg} onChange={setChainMsg} disabled={isPending} />
          <VariantSelector value={chainVariant} onChange={setChainVariant} disabled={isPending} />

          <div className="grid grid-cols-3 gap-2">
            <NumField label={t('broadcast.chainDayOffset')} value={chainDay} min={0} onChange={setChainDay} disabled={isPending} />
            <NumField label={t('broadcast.chainSortOrder')} value={chainOrder} min={0} onChange={setChainOrder} disabled={isPending} />
            <NumField label={t('broadcast.chainInterval')} value={chainInterval} min={1} onChange={setChainInterval} disabled={isPending} />
          </div>

          <Button
            className="w-full"
            onClick={handleAddChain}
            disabled={!chainMsg.text.trim()}
            loading={createChainMutation.isPending}
            icon={<Link2 className="h-4 w-4" />}
          >
            {createChainMutation.isPending ? t('broadcast.adding') : t('broadcast.addChainMessage')}
          </Button>

          <div className="space-y-2 border-t border-line pt-3">
            {chainList.data?.length === 0 && (
              <p className="py-2 text-center text-label font-semibold text-ink-subtle">{t('broadcast.noChainMessages')}</p>
            )}
            {chainList.data?.map((cm) => (
              <div key={cm.id} className="space-y-1.5 rounded-lg bg-surface p-3 shadow-card">
                {editingId === cm.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className={`${fieldCls} resize-y`}
                      rows={3}
                    />
                    <VariantSelector value={editVariant} onChange={setEditVariant} />
                    <div className="grid grid-cols-3 gap-2">
                      <NumField label={t('broadcast.chainDayOffset')} value={editDay} min={0} onChange={setEditDay} />
                      <NumField label={t('broadcast.chainSortOrder')} value={editOrder} min={0} onChange={setEditOrder} />
                      <NumField label={t('broadcast.chainInterval')} value={editInterval} min={1} onChange={setEditInterval} />
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="md" onClick={saveEdit} disabled={!editText.trim()} loading={updateChainMutation.isPending} icon={<Check className="h-3.5 w-3.5" />}>
                        {t('common.save')}
                      </Button>
                      <Button className="flex-1" variant="secondary" size="md" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-label font-bold text-care">{t('broadcast.chainDay', { day: cm.dayOffset })}</span>
                      <span className="text-label font-semibold text-ink-subtle">#{cm.sortOrder}</span>
                      {cm.mediaType !== 'text' && <Pill tone="link">{cm.mediaType}</Pill>}
                      <VariantBadge variant={cm.variant} />
                    </div>
                    <p
                      onClick={() => toggleExpand(cm.id)}
                      className={cn(
                        'cursor-pointer whitespace-pre-wrap text-body-s text-ink',
                        expandedIds.has(cm.id) ? '' : 'line-clamp-2',
                      )}
                    >{cm.text}</p>
                    <div className="flex items-center justify-between text-label font-semibold text-ink-muted">
                      <div className="flex items-center gap-3">
                        <span>{t('broadcast.deliveries')}: {cm._count.deliveries}</span>
                        <span>{t('broadcast.reads')}: {(cm.deliveries as unknown[]).length}</span>
                        {cm._count.deliveries > 0 && (
                          <span className="text-warm-ink">
                            {Math.round(((cm.deliveries as unknown[]).length / cm._count.deliveries) * 100)}% {t('broadcast.openRate')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="icon" aria-label={t('broadcast.editChain')} title={t('broadcast.editChain')} onClick={() => startEdit(cm)} icon={<Pencil className="h-4 w-4" />} />
                        <Button
                          variant="icon"
                          aria-label={cm.isActive ? t('broadcast.active') : t('broadcast.inactive')}
                          title={cm.isActive ? t('broadcast.active') : t('broadcast.inactive')}
                          onClick={() => updateChainMutation.mutate({ id: cm.id, isActive: !cm.isActive })}
                          icon={cm.isActive ? <ToggleRight className="h-5 w-5 text-care" /> : <ToggleLeft className="h-5 w-5 text-ink-subtle" />}
                        />
                        <Button
                          variant="icon"
                          className="text-sos"
                          aria-label={t('broadcast.deleteConfirm')}
                          onClick={() => setDeleteId(cm.id)}
                          icon={<Trash2 className="h-4 w-4" />}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {result && (
        <p className={cn('py-1 text-center text-body-s font-semibold', resultError ? 'text-sos' : 'text-care')}>
          {result}
        </p>
      )}

      <Sheet
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        title={t('broadcast.deleteConfirm')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleteChainMutation.isPending}
              onClick={() => {
                if (!deleteId) return;
                deleteChainMutation.mutate({ id: deleteId });
                setDeleteId(null);
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
