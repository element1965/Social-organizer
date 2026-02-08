import { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';

interface BroadcastPanelProps {
  onClose: () => void;
}

export function BroadcastPanel({ onClose }: BroadcastPanelProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'all' | 'direct'>('all');
  const [telegramId, setTelegramId] = useState('');
  const [message, setMessage] = useState('');
  const [mediaType, setMediaType] = useState<'text' | 'photo' | 'video'>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const sendAllMutation = trpc.broadcast.sendAll.useMutation({
    onSuccess: (data) => setResult(t('broadcast.sentSuccess', { count: data.sent })),
    onError: () => setResult(t('broadcast.error')),
  });
  const sendDirectMutation = trpc.broadcast.sendDirect.useMutation({
    onSuccess: () => setResult(t('broadcast.directSuccess')),
    onError: () => setResult(t('broadcast.error')),
  });

  const isPending = sendAllMutation.isPending || sendDirectMutation.isPending;

  const handleSend = () => {
    if (!message.trim()) return;
    setResult(null);

    if (mode === 'all') {
      sendAllMutation.mutate({
        text: message.trim(),
        mediaType,
        mediaUrl: mediaType !== 'text' ? mediaUrl.trim() : undefined,
      });
    } else {
      if (!telegramId.trim()) return;
      sendDirectMutation.mutate({
        telegramId: telegramId.trim(),
        text: message.trim(),
      });
    }
  };

  return (
    <div className="fixed inset-x-4 bottom-20 max-h-[60vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col border border-gray-200 dark:border-gray-700">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('all')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
              mode === 'all'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            {t('broadcast.allUsers')}
          </button>
          <button
            onClick={() => setMode('direct')}
            className={`flex-1 py-2 text-sm rounded-lg transition-colors ${
              mode === 'direct'
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            {t('broadcast.directUser')}
          </button>
        </div>

        {/* TG ID input (direct mode) */}
        {mode === 'direct' && (
          <input
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder={t('broadcast.telegramIdPlaceholder')}
            className="w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        )}

        {/* Message textarea */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('broadcast.messagePlaceholder')}
          className="w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          rows={3}
        />

        {/* Media type (all mode only) */}
        {mode === 'all' && (
          <>
            <div className="flex gap-2">
              {(['text', 'photo', 'video'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setMediaType(type)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    mediaType === type
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {type === 'text' ? 'Text' : type === 'photo' ? t('broadcast.photo') : t('broadcast.video')}
                </button>
              ))}
            </div>

            {mediaType !== 'text' && (
              <input
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder={t('broadcast.mediaUrlPlaceholder')}
                className="w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </>
        )}

        {/* Result */}
        {result && (
          <p className={`text-sm text-center py-1 ${result.includes('Failed') || result.includes('ошибка') ? 'text-red-500' : 'text-emerald-500'}`}>
            {result}
          </p>
        )}
      </div>

      {/* Send button */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleSend}
          disabled={!message.trim() || isPending || (mode === 'direct' && !telegramId.trim())}
          className="w-full py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
        >
          {isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('broadcast.sending')}
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              {t('broadcast.send')}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
