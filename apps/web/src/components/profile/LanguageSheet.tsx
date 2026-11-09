import { useTranslation } from 'react-i18next';
import { languageNames, type SupportedLanguage } from '@so/i18n';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Sheet } from '../ui2/Sheet';

const codes = Object.keys(languageNames) as SupportedLanguage[];

export function LanguageSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const updateLanguage = trpc.settings.updateLanguage.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const current = (i18n.language.split('-')[0] || 'en') as SupportedLanguage;

  const pick = (code: SupportedLanguage) => {
    void i18n.changeLanguage(code);
    try {
      localStorage.setItem('language', code);
    } catch {
      /* storage unavailable */
    }
    updateLanguage.mutate({ language: code });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('settings.language')}>
      <div className="max-h-[60vh] overflow-y-auto">
        {codes.map((code) => {
          const selected = code === current;
          return (
            <button
              key={code}
              type="button"
              className={cn(
                'so-focus flex min-h-row w-full items-center rounded-md px-2 text-left text-body',
                selected ? 'font-bold text-care' : 'font-semibold text-ink',
              )}
              onClick={() => pick(code)}
            >
              {languageNames[code]}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
