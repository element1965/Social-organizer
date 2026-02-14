import { useState, useRef } from 'react';
import { Loader2, Upload, Link, Paperclip, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface MessageData {
  text: string;
  mediaType: 'text' | 'photo' | 'video';
  mediaUrl?: string;
  mediaFileId?: string;
  buttonUrl?: string;
  buttonText?: string;
}

interface MessageComposerProps {
  value: MessageData;
  onChange: (data: MessageData) => void;
  disabled?: boolean;
}

const inputCls = 'w-full p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export function MessageComposer({ value, onChange, disabled }: MessageComposerProps) {
  const { t } = useTranslation();
  const [mediaFileName, setMediaFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
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
        setMediaFileName('');
        return;
      }

      const data = (await res.json()) as { fileId: string; mediaType: 'photo' | 'video' };
      onChange({ ...value, mediaFileId: data.fileId, mediaType: data.mediaType });
    } catch {
      setMediaFileName('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    setMediaFileName('');
    onChange({ ...value, mediaFileId: undefined });
  };

  return (
    <div className="space-y-3">
      {/* Message textarea */}
      <textarea
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder={t('broadcast.messagePlaceholder')}
        className={`${inputCls} resize-none`}
        rows={3}
        disabled={disabled}
      />

      {/* Media type buttons */}
      <div className="flex gap-2">
        {(['text', 'photo', 'video'] as const).map((type) => (
          <button
            key={type}
            onClick={() => { onChange({ ...value, mediaType: type, mediaFileId: undefined, mediaUrl: undefined }); clearFile(); }}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              value.mediaType === type
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            {type === 'text' ? 'Text' : type === 'photo' ? t('broadcast.photo') : t('broadcast.video')}
          </button>
        ))}
      </div>

      {/* Media input: file upload OR URL */}
      {value.mediaType !== 'text' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={value.mediaType === 'photo' ? 'image/*' : 'video/*'}
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || disabled}
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

          {!value.mediaFileId && (
            <input
              value={value.mediaUrl || ''}
              onChange={(e) => onChange({ ...value, mediaUrl: e.target.value })}
              placeholder={t('broadcast.mediaUrlPlaceholder')}
              className={inputCls}
              disabled={disabled}
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
            value={value.buttonText || ''}
            onChange={(e) => onChange({ ...value, buttonText: e.target.value })}
            placeholder={t('broadcast.buttonTextPlaceholder')}
            className={`${inputCls} flex-1`}
            disabled={disabled}
          />
          <input
            value={value.buttonUrl || ''}
            onChange={(e) => onChange({ ...value, buttonUrl: e.target.value })}
            placeholder="https://..."
            className={`${inputCls} flex-[2]`}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
