import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { resources } from '@so/i18n';
import { X } from 'lucide-react';

// Static files in apps/web/public/videos/regular-collection/<locale>.mp4 (one per app locale).
// Bump VIDEO_VERSION when the videos are re-recorded: the files are cached for 30 days by URL.
const VIDEO_DIR = '/videos/regular-collection';
const VIDEO_VERSION = '1';
const FALLBACK_LANG = 'en';

function videoUrl(lang: string) {
  return `${VIDEO_DIR}/${lang}.mp4?v=${VIDEO_VERSION}`;
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

/**
 * Play-icon button that opens the "how a regular collection works" video instruction
 * in the current UI language (falls back to English). The user starts playback,
 * so there are no autoplay-with-sound restrictions in Telegram / Capacitor webviews.
 */
export function RegularCollectionVideo({ className = '', showLabel = true }: { className?: string; showLabel?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const base = (i18n.language || FALLBACK_LANG).slice(0, 2).toLowerCase();
  const lang = base in resources ? base : FALLBACK_LANG;
  const [src, setSrc] = useState(() => videoUrl(lang));

  useEffect(() => {
    setSrc(videoUrl(lang));
  }, [lang]);

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
        aria-label={t('videoGuide.play')}
        title={t('videoGuide.play')}
        className={`inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors ${className}`}
      >
        <PlayCircleIcon className="w-6 h-6 shrink-0" />
        {showLabel && <span>{t('videoGuide.short')}</span>}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={t('videoGuide.regularTitle')}
          >
            <div className="relative flex flex-col items-center gap-2 max-w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex w-full items-center justify-between gap-3 text-white">
                <h2 className="text-sm font-semibold">{t('videoGuide.regularTitle')}</h2>
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
                  if (!src.startsWith(`${VIDEO_DIR}/${FALLBACK_LANG}.`)) setSrc(videoUrl(FALLBACK_LANG));
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
