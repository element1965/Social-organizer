import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { actionErrorKey, currentActionError, dismissActionError, markNavigation, subscribeActionError } from '../../lib/errors';
import { Banner } from '../ui2/Banner';
import { AlertGlyph, OfflineGlyph } from '../onboarding/states';

/**
 * The app-level "Not saved" notice: raised by the MutationCache (App.tsx) for every failed action whose call
 * site does not tell the person itself. One at a time, at the top of the screen; it stays for 8 s (the
 * countdown waits while it is touched or focused), has a close button and is read out by screen readers.
 * It belongs to the navigation it was raised on: every navigation (the router's location key changes, also
 * for a query-string change or a return to the same address) clears it, and a failure of an action started
 * before that navigation is not shown after it. Actions inside a sheet show their failure inside the sheet
 * instead (<ActionError>), never here.
 */
export function ActionErrorHost() {
  const { t } = useTranslation();
  const { key } = useLocation();
  const notice = useSyncExternalStore(subscribeActionError, currentActionError, () => null);

  // A layout effect: it runs before the new screen's own effects, so actions they start belong to the new navigation
  useLayoutEffect(() => {
    markNavigation();
  }, [key]);

  if (!notice) return null;
  const Glyph = notice.kind === 'offline' ? OfflineGlyph : AlertGlyph;
  return (
    <Banner
      key={notice.id}
      tone="sos"
      icon={<Glyph className="h-5 w-5" />}
      title={t('errors.notSaved')}
      body={t(actionErrorKey(notice.kind))}
      duration={8000}
      closeLabel={t('common.close')}
      onClose={() => dismissActionError(notice.id)}
    />
  );
}
