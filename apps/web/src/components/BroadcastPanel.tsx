import { useState, useRef } from 'react';
import { X, Send, Loader2, Upload, Link, Paperclip } from 'lucide-react';
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
  const [mediaFileId, setMediaFileId] = useState('');
  const [mediaFileName, setMediaFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [buttonUrl, setButtonUrl] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendAllMutation = trpc.broadcast.sendAll.useMutation({
    onSuccess: (data) => setResult(t('broadcast.sentSuccess', { count: data.sent })),
    onError: () => setResult(t('broadcast.error')),
  });
  const sendDirectMutation = trpc.broadcast.sendDirect.useMutation({
    onSuccess: () => setResult(t('broadcast.directSuccess')),
    onError: () => setResult(t('broadcast.error')),
  });

  const isPending = sendAllMutation.isPending || sendDirectMutation.isPending || uploading;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setMediaFileName(file.name);

    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/broadcast/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        setResult(errData.error || t('broadcast.error'));
        setMediaFileName('');
        return;
      }

      const data = (await res.json()) as { fileId: string; mediaType: 'photo' | 'video' };
      setMediaFileId(data.fileId);
      setMediaType(data.mediaType);
    } catch (err) {
      setResult(`${t('broadcast.error')}: ${(err as Error).message}`);
      setMediaFileName('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    setMediaFileId('');
    setMediaFileName('');
  };

  const handleSend = () => {
    if (!message.trim()) return;
    setResult(null);

    if (mode === 'all') {
      sendAllMutation.mutate({
        text: message.trim(),
        mediaType,
        mediaUrl: mediaType !== 'text' && !mediaFileId ? mediaUrl.trim() || undefined : undefined,
        mediaFileId: mediaFileId || undefined,
        buttonUrl: buttonUrl.trim() || undefined,
        buttonText: buttonText.trim() || undefined,
      });
    } else {
      if (!telegramId.trim()) return;
      sendDirectMutation.mutate({
        telegramId: telegramId.trim(),
        text: message.trim(),
      });
    }
  };

  const inputCls = 'w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="fixed inset-x-4 bottom-20 max-h-[70vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col border border-gray-200 dark:border-gray-700">
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
            className={inputCls}
          />
        )}

        {/* Message textarea */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('broadcast.messagePlaceholder')}
          className={`${inputCls} resize-none`}
          rows={3}
        />

        {/* Media section (all mode only) */}
        {mode === 'all' && (
          <>
            {/* Media type buttons */}
            <div className="flex gap-2">
              {(['text', 'photo', 'video'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => { setMediaType(type); clearFile(); }}
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

            {/* Media input: file upload OR URL */}
            {mediaType !== 'text' && (
              <div className="space-y-2">
                {/* File upload */}
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={mediaType === 'photo' ? 'image/*' : 'video/*'}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    {uploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    {t('broadcast.uploadFile')}
                  </button>
                  {mediaFileName && (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <Paperclip className="w-3 h-3" />
                      {mediaFileName}
                      <button onClick={clearFile} className="ml-1 text-gray-400 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>

                {/* URL input (if no file uploaded) */}
                {!mediaFileId && (
                  <input
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder={t('broadcast.mediaUrlPlaceholder')}
                    className={inputCls}
                  />
                )}
              </div>
            )}

            {/* Button link */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <Link className="w-3.5 h-3.5" />
                {t('broadcast.buttonLink')}
              </div>
              <div className="flex gap-2">
                <input
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder={t('broadcast.buttonTextPlaceholder')}
                  className={`${inputCls} flex-1`}
                />
                <input
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://..."
                  className={`${inputCls} flex-[2]`}
                />
              </div>
            </div>
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
