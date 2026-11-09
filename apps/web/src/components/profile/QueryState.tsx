import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';

export function QueryState({
  isLoading,
  isError,
  onRetry,
  children,
}: {
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  if (isLoading) {
    return <p className="py-8 text-center text-body font-semibold text-ink-muted">{t('common.loading')}</p>;
  }
  if (isError) {
    return (
      <div className="py-8 text-center">
        <p className="text-body font-semibold text-ink">{t('common.error')}</p>
        {onRetry ? (
          <Button variant="secondary" size="md" className="mt-3" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : null}
      </div>
    );
  }
  return children;
}
