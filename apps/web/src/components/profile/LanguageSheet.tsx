import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { languageNames, type SupportedLanguage } from '@so/i18n/languages';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../lib/trpc';
import { pendingSettingValue, saveDisplaySetting } from '../../lib/pendingSettings';
import { cn } from '../../lib/utils';
import { Sheet } from '../ui2/Sheet';

const codes = Object.keys(languageNames) as SupportedLanguage[];

/** The current UI language as one of ours (`en` for anything unknown). */
export function useCurrentLanguage(): SupportedLanguage {
  const { i18n } = useTranslation();
  const code = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0] as SupportedLanguage;
  return code in languageNames ? code : 'en';
}

/**
 * Language picker for every surface (profile, public site, sign-in): a sheet on phones, a dialog on wide screens,
 * two columns of native names with the current one marked. Signed-in users also get the choice saved on the server.
 */
export function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  // The language is a display preference of this device: it switches at once and stays when the account copy
  // cannot be saved. That save is quiet and serialised (lib/pendingSettings.ts); a failed one is sent again on
  // the next start or the next pick (the same language included).
  const saveLanguage = (code: SupportedLanguage) =>
    saveDisplaySetting(utils.client, userId, 'language', code, () => void utils.settings.get.invalidate());
  const current = useCurrentLanguage();
  const listRef = useRef<HTMLDivElement>(null);

  // The current language may be far down the list (Русский is last): bring it into view when the sheet opens.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const pick = (code: SupportedLanguage) => {
    onClose();
    if (code === current) {
      // Picking the language in use again retries a save of it that failed earlier
      if (isAuthenticated && pendingSettingValue(userId, 'language') === code) saveLanguage(code);
      return;
    }
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem('language', code);
    } catch {
      /* storage unavailable */
    }
    if (isAuthenticated) saveLanguage(code);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('settings.language')} bodyClassName="max-h-[60dvh]">
      <div ref={listRef} className="grid grid-cols-2 gap-1 pb-1">
        {codes.map((code) => {
          const selected = code === current;
          return (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={selected}
              className={cn(
                'so-focus flex min-h-12 items-center gap-2 rounded-md px-3 text-start text-body transition-colors',
                selected ? 'bg-care-soft font-bold text-care' : 'font-semibold text-ink hover:bg-surface-2',
              )}
              onClick={() => pick(code)}
            >
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {languageNames[code]}
              </span>
              {selected ? (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 flex-none" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              ) : (
                <span className="flex-none text-caption font-bold uppercase text-ink-muted">{code}</span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
