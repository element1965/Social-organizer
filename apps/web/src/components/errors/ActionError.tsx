import { useTranslation } from 'react-i18next';
import { actionErrorKey, errorKind } from '../../lib/errors';
import { cn } from '../../lib/utils';
import { Button } from '../ui2/Button';

/**
 * "Not saved" right under the control the person used (or inside the sheet the action was taken in): what
 * happened and what to do. Read out once when it appears (role="alert" is announced on insertion, focus stays
 * put). Renders nothing without an error, or for a cancelled request. `onRetry` adds a "Retry" button for
 * an action the person did not start with a button of their own (an automatic step).
 * A call site that shows this sets `meta: { notifyOnError: false }` on its mutation, so the app-level
 * notice does not say it a second time.
 */
export function ActionError({
  error,
  className,
  onRetry,
  retrying = false,
}: {
  error: unknown;
  className?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useTranslation();
  if (!error) return null;
  const kind = errorKind(error);
  if (kind === 'aborted') return null;
  return (
    <div role="alert" className={cn('mt-3 rounded-lg bg-sos-soft px-3.5 py-2.5 text-label font-semibold text-sos', className)}>
      <p className="font-extrabold">{t('errors.notSaved')}</p>
      <p className="mt-0.5">{t(actionErrorKey(kind))}</p>
      {onRetry ? (
        <Button variant="textDanger" className="-ms-2 mt-1 min-h-11" loading={retrying} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
