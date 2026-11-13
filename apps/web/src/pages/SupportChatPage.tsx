import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Paperclip, Send, Volume2, X } from 'lucide-react';
import { trpc, authFetch } from '../lib/trpc';
import { Avatar } from '../components/ui2/Avatar';
import { Button } from '../components/ui2/Button';
import { PersonRow } from '../components/ui2/PersonRow';
import { Screen } from '../components/ui2/Screen';
import { Group } from '../components/ui2/Group';
import { useSmartBack } from '../components/profile/useSmartBack';
import { cn } from '../lib/utils';

type Conversation = {
  key: string;
  userId: string | null;
  platformId: string | null;
  userName: string | null;
  photoUrl: string | null;
  lastMessage: string;
  lastAt: Date | string;
  totalCount: number;
};

type MediaAttachment = {
  fileId: string;
  mediaType: 'photo' | 'video' | 'document';
  name?: string;
};

const fieldCls =
  'min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 so-field text-body-s font-semibold text-ink outline-none placeholder:text-ink-subtle focus:border-care disabled:opacity-50';

/** Render a media attachment in a chat bubble */
function MediaPreview({ fileId, mediaType, mediaName, isAdmin }: {
  fileId: string;
  mediaType: string;
  mediaName?: string | null;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const url = `/api/media/${fileId}`;
  if (mediaType === 'photo') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={url}
          alt={t('support.photoAlt')}
          className="max-h-[220px] max-w-[220px] rounded-xl object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  if (mediaType === 'video') {
    return (
      <video
        src={url}
        controls
        className="max-h-[220px] max-w-[220px] rounded-xl"
        preload="metadata"
      />
    );
  }
  if (mediaType === 'voice') {
    return (
      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 shrink-0" />
        <audio src={url} controls className="h-8 max-w-[180px]" preload="metadata" />
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-body-s underline',
        isAdmin ? 'bg-canvas/20 text-care-on' : 'bg-link-soft text-link',
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="max-w-[160px] truncate">{mediaName || t('support.file')}</span>
    </a>
  );
}

export function SupportChatPage() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me/help');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState('');
  const [attachment, setAttachment] = useState<MediaAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isAdmin = adminData?.isAdmin ?? false;

  const conversations = trpc.support.listConversations.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  // Keep the open thread pointed at the latest row for that conversation.
  useEffect(() => {
    if (!selected || !conversations.data) return;
    const fresh = conversations.data.find((conv) => conv.key === selected.key);
    if (!fresh || fresh === selected) return;
    setSelected(fresh);
  }, [conversations.data, selected]);

  const messages = trpc.support.getMessages.useQuery(
    { userId: selected?.userId ?? undefined, platformId: selected?.platformId ?? undefined },
    { enabled: !!selected, refetchInterval: 5000 },
  );

  const sendReply = trpc.support.sendReply.useMutation({
    onSuccess: () => {
      setReply('');
      setAttachment(null);
      messages.refetch();
      conversations.refetch();
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);
      const res = await authFetch('/api/broadcast/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) return;
      const data = await res.json() as { fileId: string; mediaType: 'photo' | 'video' };
      const mediaType = data.mediaType === 'video' ? 'video'
        : data.mediaType === 'photo' ? 'photo'
        : 'document';
      setAttachment({ fileId: data.fileId, mediaType, name: file.name });
    } catch { /* ignore */ } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    if (!reply.trim() && !attachment) return;
    if (!selected) return;
    sendReply.mutate({
      userId: selected.userId ?? undefined,
      platformId: selected.platformId ?? undefined,
      userName: selected.userName ?? undefined,
      message: reply.trim(),
      mediaFileId: attachment?.fileId,
      mediaType: attachment?.mediaType,
      mediaName: attachment?.name,
    });
  };

  const personName = selected?.userName || t('support.unknownUser');
  const screenBack = selected
    ? { label: t('common.back'), onClick: () => setSelected(null) }
    : back;

  if (!isAdmin) {
    return (
      <Screen title={t('support.title')} back={back} width="column">
        <p className="py-16 text-center text-body-s text-ink-muted">{t('common.notFound')}</p>
      </Screen>
    );
  }

  return (
    <Screen
      title={selected ? personName : t('support.title')}
      back={screenBack}
      width="column"
      fill={!!selected}
      action={selected ? <Avatar name={personName} src={selected.photoUrl} size={36} /> : undefined}
    >
      {selected ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
            {messages.isLoading ? (
              <div className="flex justify-center py-8">
                <span className="so-spin h-6 w-6 rounded-full border-2 border-ink-subtle/40 border-t-ink-subtle" />
              </div>
            ) : messages.data?.length === 0 ? (
              <p className="py-8 text-center text-body-s text-ink-muted">{t('support.noMessages')}</p>
            ) : (
              messages.data?.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[85%] space-y-2 rounded-2xl p-3 text-body-s',
                    msg.fromAdmin
                      ? 'ml-auto rounded-br-md bg-care text-care-on'
                      : 'rounded-bl-md border border-line bg-surface text-ink',
                  )}
                >
                  {msg.mediaFileId && msg.mediaType && (
                    <MediaPreview
                      fileId={msg.mediaFileId}
                      mediaType={msg.mediaType}
                      mediaName={msg.mediaName}
                      isAdmin={msg.fromAdmin}
                    />
                  )}
                  {msg.message && (
                    <p className="whitespace-pre-wrap">{msg.message}</p>
                  )}
                  <p className={cn('text-micro opacity-60', msg.fromAdmin ? 'text-right' : '')}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))
            )}
          </div>

          {attachment && (
            <div className="mb-1 flex shrink-0 items-center gap-2 rounded-lg border border-line bg-link-soft px-3 py-2 text-body-s text-link">
              <span className="min-w-0 flex-1 truncate">{attachment.name || attachment.mediaType}</span>
              <button type="button" onClick={() => setAttachment(null)} className="so-focus shrink-0 text-sos" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-2 border-t border-line py-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label={t('support.attachFile')}
              icon={uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
            />
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) handleSend();
              }}
              placeholder={t('support.replyPlaceholder')}
              aria-label={t('support.replyPlaceholder')}
              className={fieldCls}
              disabled={sendReply.isPending}
            />
            <Button
              className="h-11 w-11 shrink-0 rounded-lg px-0"
              onClick={handleSend}
              disabled={(!reply.trim() && !attachment) || sendReply.isPending}
              loading={sendReply.isPending}
              aria-label={t('chat.send')}
              icon={<Send className="h-4 w-4" />}
            />
          </div>
        </div>
      ) : (
        <div>
          {conversations.isLoading ? (
            <div className="flex justify-center py-12">
              <span className="so-spin h-6 w-6 rounded-full border-2 border-ink-subtle/40 border-t-ink-subtle" />
            </div>
          ) : !conversations.data?.length ? (
            <p className="py-12 text-center text-body-s text-ink-muted">{t('support.noConversations')}</p>
          ) : (
            <Group>
              {conversations.data.map((conv) => (
                <PersonRow
                  key={conv.key}
                  name={conv.userName || t('support.unknownUser')}
                  src={conv.photoUrl}
                  subtitle={conv.lastMessage}
                  value={new Date(conv.lastAt).toLocaleDateString()}
                  onClick={() => setSelected(conv)}
                />
              ))}
            </Group>
          )}
        </div>
      )}
    </Screen>
  );
}
