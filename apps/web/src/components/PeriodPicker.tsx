import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown } from 'lucide-react';
import { Button } from './ui/button';

const PERIOD_OPTIONS = [1, 7, 14, 28, 90, 365, 0] as const;

interface PeriodPickerProps {
  open: boolean;
  onClose: () => void;
  value: number;
  onChange: (days: number) => void;
}

function periodLabel(t: (key: string) => string, days: number): string {
  if (days === 0) return t('dashboard.periodAllTime');
  if (days === 1) return t('dashboard.periodPast1');
  if (days === 7) return t('dashboard.periodPast7');
  if (days === 14) return t('dashboard.periodPast14');
  if (days === 28) return t('dashboard.periodPast28');
  if (days === 90) return t('dashboard.periodPast90');
  if (days === 365) return t('dashboard.periodPast365');
  return `${days}d`;
}

export function PeriodPicker({ open, onClose, value, onChange }: PeriodPickerProps) {
  const { t } = useTranslation();
  const [temp, setTemp] = useState(value);

  useEffect(() => {
    if (open) setTemp(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900"
      onClick={onClose}
    >
      <div className="flex-1 flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {t('dashboard.dateRange')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-300" />
          </button>
        </div>

        {/* Radio list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {PERIOD_OPTIONS.map((days) => (
            <button
              key={days}
              onClick={() => setTemp(days)}
              className="w-full flex items-center gap-3 py-3.5 border-b border-gray-100 dark:border-gray-800"
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  temp === days
                    ? 'border-blue-600'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {temp === days && (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                )}
              </div>
              <span className="text-sm text-gray-900 dark:text-white">
                {periodLabel(t, days)}
              </span>
            </button>
          ))}
        </div>

        {/* Bottom button */}
        <div className="shrink-0 px-4 py-4 pb-8 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              onChange(temp);
              onClose();
            }}
          >
            {t('dashboard.showResults')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Inline period chip trigger */
export function PeriodChip({
  days,
  onClick,
}: {
  days: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-medium"
    >
      {periodLabel(t, days)}
      <ChevronDown className="w-3 h-3" />
    </button>
  );
}
