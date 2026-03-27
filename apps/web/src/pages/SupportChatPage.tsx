import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Send, MessageSquare, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { Avatar } from '../components/ui/avatar';
import { cn } from '../lib/utils';

type Conversation = {
  key: string;
  userId: string | null;
  platformId: string | null;
  userName: string | null;
  photoUrl: string | null;
  lastMessage: string;
  lastAt: Date;
  totalCount: number;
};

export function SupportChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState('');

  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isAdmin = adminData?.isAdmin ?? false;

  const conversations = trpc.support.listConversations.useQuery(undefined, {
    enabled: isAdmin,
    refetchInterval: 10000,
  });

  const messages = trpc.support.getMessages.useQuery(
    { userId: selected?.userId ?? undefined, platformId: selected?.platformId ?? undefined },
    { enabled: !!selected, refetchInterval: 5000 },
  );

  const sendReply = trpc.support.sendReply.useMutation({
    onSuccess: () => {
      setReply('');
      messages.refetch();
      conversations.refetch();
    },
  });

  const handleSend = () => {
    if (!reply.trim() || !selected) return;
    sendReply.mutate({
      userId: selected.userId ?? undefined,
      platformId: selected.platformId ?? undefined,
      userName: selected.userName ?? undefined,
      message: reply.trim(),
    });
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <p className="text-gray-400">{t('common.notFound')}</p>
      </div>
    );
  }

  // === Messages thread view ===
  if (selected) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={() => setSelected(null)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <Avatar src={selected.photoUrl} name={selected.userName || '?'} size="sm" />
          <p className="font-semibold text-gray-900 dark:text-white">
            {selected.userName || t('support.unknownUser')}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : messages.data?.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">{t('support.noMessages')}</p>
          ) : (
            messages.data?.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'max-w-[85%] p-3 rounded-2xl text-sm',
                  msg.fromAdmin
                    ? 'ml-auto bg-blue-600 text-white rounded-br-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md',
                )}
              >
                <p className="whitespace-pre-wrap">{msg.message}</p>
                <p className={cn('text-xs mt-1 opacity-60', msg.fromAdmin ? 'text-right' : '')}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Reply input */}
        <div className="flex items-center gap-2 p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={t('support.replyPlaceholder')}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sendReply.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!reply.trim() || sendReply.isPending}
            className="p-2.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors shrink-0"
          >
            {sendReply.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // === Conversation list view ===
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          {t('support.title')}
        </p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : !conversations.data?.length ? (
          <p className="text-center text-gray-400 py-12 text-sm">{t('support.noConversations')}</p>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {conversations.data.map((conv) => (
              <button
                key={conv.key}
                onClick={() => setSelected(conv)}
                className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <Avatar src={conv.photoUrl} name={conv.userName || '?'} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                    {conv.userName || t('support.unknownUser')}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {conv.lastMessage}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-gray-400">
                    {new Date(conv.lastAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{conv.totalCount}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
