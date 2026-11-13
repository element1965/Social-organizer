import { authFetch } from '../lib/trpc';
import { useRef, useState } from 'react';
import { Link, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui2/Button';

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

const fieldCls =
  'w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 so-field text-body-s font-semibold text-ink outline-none placeholder:text-ink-subtle focus:border-care disabled:opacity-50';

/** Detect media type from URL string */
function detectMediaTypeFromUrl(url: string): 'photo' | 'video' | 'text' {
  if (!url) return 'text';
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Video hosting sites
    if (host.includes('youtube.com') || host.includes('youtu.be')
      || host.includes('vimeo.com') || host.includes('dailymotion.com')
      || host.includes('tiktok.com') || host.includes('rutube.ru')) {
      return 'video';
    }
    const ext = u.pathname.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'photo';
    if (['mp4', 'mov', 'avi', 'webm', 'mkv', 'wmv', 'flv'].includes(ext)) return 'video';
  } catch { /* not a valid URL yet */ }
  return 'text';
}

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

      const res = await authFetch('/api/broadcast/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        setMediaFileName('');
        return;
      }

      const data = (await res.json()) as { fileId: string; mediaType: 'photo' | 'video' };
      onChange({ ...value, mediaFileId: data.fileId, mediaType: data.mediaType, mediaUrl: undefined });
    } catch {
      setMediaFileName('');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearMedia = () => {
    setMediaFileName('');
    onChange({ ...value, mediaFileId: undefined, mediaUrl: undefined, mediaType: 'text' });
  };

  const handleUrlChange = (url: string) => {
    const detected = detectMediaTypeFromUrl(url);
    onChange({ ...value, mediaUrl: url, mediaType: detected === 'text' && url.trim() ? 'photo' : detected, mediaFileId: undefined });
  };

  const focusIntoView = (event: React.FocusEvent<HTMLElement>) => {
    setTimeout(() => event.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
  };

  return (
    <div className="space-y-3">
      <textarea
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder={t('broadcast.messagePlaceholder')}
        className={`${fieldCls} resize-y`}
        rows={3}
        disabled={disabled}
        onFocus={focusIntoView}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || disabled}
            icon={uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          >
            {t('broadcast.uploadFile')}
          </Button>
          {mediaFileName && (
            <span className="flex items-center gap-1 text-label font-semibold text-care">
              <Paperclip className="h-3 w-3" />
              {mediaFileName}
              <button type="button" onClick={clearMedia} className="so-focus ml-1 text-ink-subtle hover:text-sos" aria-label={t('common.close')}>
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>

        {!value.mediaFileId && (
          <input
            value={value.mediaUrl || ''}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder={t('broadcast.mediaUrlPlaceholder')}
            className={fieldCls}
            disabled={disabled}
            onFocus={focusIntoView}
          />
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-label font-semibold text-ink-muted">
          <Link className="h-3.5 w-3.5" />
          {t('broadcast.buttonLink')}
        </div>
        <div className="flex gap-2">
          <input
            value={value.buttonText || ''}
            onChange={(e) => onChange({ ...value, buttonText: e.target.value })}
            placeholder={t('broadcast.buttonTextPlaceholder')}
            className={`${fieldCls} flex-1`}
            disabled={disabled}
            onFocus={focusIntoView}
          />
          <input
            value={value.buttonUrl || ''}
            onChange={(e) => onChange({ ...value, buttonUrl: e.target.value })}
            placeholder={t('broadcast.urlPlaceholder')}
            className={`${fieldCls} flex-[2]`}
            disabled={disabled}
            onFocus={focusIntoView}
          />
        </div>
      </div>
    </div>
  );
}
