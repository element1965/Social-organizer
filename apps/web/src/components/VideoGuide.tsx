import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { resources } from '@so/i18n';
import { X } from 'lucide-react';

// Static files in apps/web/public/videos/<video>/<locale>.mp4 (one per app locale).
// Bump a video's version when it is re-recorded: the files are cached for 30 days by URL.
const VIDEOS = {
  'regular-collection': { version: '1', titleKey: 'videoGuide.regularTitle' },
  'invite-link': { version: '1', titleKey: 'videoGuide.inviteLinkTitle' },
  'app-start': { version: '1', titleKey: 'videoGuide.appStartTitle' },
} as const;
export type VideoGuideId = keyof typeof VIDEOS;
const FALLBACK_LANG = 'en';

function videoUrl(video: VideoGuideId, lang: string) {
  return `/videos/${video}/${lang}.mp4?v=${VIDEOS[video].version}`;
}

/** Circle with a triangle inside. */
function PlayCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

const LINK_COLORS = 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300';

/**
 * Play-icon button that opens a video instruction in the current UI language
 * (falls back to English). The user starts playback, so there are no
 * autoplay-with-sound restrictions in Telegram / Capacitor webviews.
 * `label`: 'short' shows "Video guide", 'title' shows the video's own title.
 * `colorClassName` replaces the default blue link colors (e.g. on dark screens).
 */
export function VideoGuide({
  video = 'regular-collection',
  className = '',
  showLabel = true,
  label = 'short',
  colorClassName = LINK_COLORS,
}: {
  video?: VideoGuideId;
  className?: string;
  showLabel?: boolean;
  label?: 'short' | 'title';
  colorClassName?: string;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const base = (i18n.language || FALLBACK_LANG).slice(0, 2).toLowerCase();
  const lang = base in resources ? base : FALLBACK_LANG;
  const [src, setSrc] = useState(() => videoUrl(video, lang));
  const title = t(VIDEOS[video].titleKey);

  useEffect(() => {
    setSrc(videoUrl(video, lang));
  }, [video, lang]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={showLabel && label === 'title' ? title : t('videoGuide.play')}
        title={t('videoGuide.play')}
        className={`inline-flex items-center gap-1.5 text-sm font-medium ${colorClassName} transition-colors ${className}`}
      >
        <PlayCircleIcon className="w-6 h-6 shrink-0" />
        {showLabel && <span>{label === 'title' ? title : t('videoGuide.short')}</span>}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="relative flex flex-col items-center gap-2 max-w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex w-full items-center justify-between gap-3 text-white">
                <h2 className="text-sm font-semibold">{title}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t('videoGuide.close')}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <video
                key={src}
                src={src}
                controls
                playsInline
                preload="none"
                className="block rounded-lg bg-black h-[80vh] max-h-[80vh] max-w-full aspect-[9/16]"
                onError={() => {
                  if (!src.startsWith(`/videos/${video}/${FALLBACK_LANG}.`)) setSrc(videoUrl(video, FALLBACK_LANG));
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
