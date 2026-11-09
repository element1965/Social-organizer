import { useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunityHoldNote } from '../components/moderation/CommunityHoldNote';
import { ComplainSheet } from '../components/moderation/ComplainEntry';
import { ReviewSheet } from '../components/moderation/ReviewFeedRows';
import { Group, Row } from '../components/ui2/Group';

const SAMPLE = {
  id: 'preview',
  collectionId: 'preview-collection',
  authorName: 'Анна',
  reasons: [
    { reason: 'COMPLAINTS', count: 2 },
    { reason: 'ACCOUNT_HACKED', count: 1 },
  ],
  myVote: null,
};

/**
 * Dev-only frames for the complaint sheet, the circle question and the hold plaques.
 * Open /dev/moderation?frame=complain|question|banners&theme=light|dark&lng=ru|en
 */
export function ModerationPreviewPage() {
  const { t, i18n } = useTranslation();
  const [ready, setReady] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const frame = params.get('frame') ?? 'banners';
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
  const lng = params.get('lng') === 'en' ? 'en' : 'ru';

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    let cancelled = false;
    i18n.changeLanguage(lng).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [i18n, lng, theme]);

  return (
    <div className="min-h-screen bg-canvas text-ink" data-ready={ready ? 'yes' : 'no'} data-frame={frame}>
      <div className="mx-auto w-full max-w-[680px] px-4 py-6">
        <CommunityHoldNote owner={false} />
        <CommunityHoldNote owner onSupport={() => undefined} />
        <Group className="mt-4">
          <Row title={t('moderation.complain')} variant="danger" />
        </Group>
      </div>
      <ComplainSheet open={frame === 'complain'} onClose={() => undefined} />
      <ReviewSheet open={frame === 'question'} onClose={() => undefined} review={SAMPLE} />
    </div>
  );
}
