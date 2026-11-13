import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { safeAddressee } from '@so/shared';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { Textarea } from '../ui2/Textarea';
import { MessengerIconButtons } from '../share/MessengerButtons';
import { IconCheck, IconShare } from './icons';
import { permanentInviteUrl } from './links';
import { shareLink } from '../../lib/share';
import { withSrc, type Messenger } from '../../lib/messengerShare';

/** A list longer than this is no longer "people I am writing to now". */
const MAX_NAMES = 30;

/**
 * Personal invitations in a batch: the person types the names of people they know, one per line, and
 * gets a link for each that greets that person by name (`?to=`). The names stay on this screen: they
 * are never sent to the server and no address book is read. Each link is sent by hand, one by one.
 */
export function NamedInvites({
  open,
  onClose,
  slug,
  name,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  /** The inviter's own name, for the message text */
  name: string;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState('');
  const [sent, setSent] = useState<string[]>([]);

  const names = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[\n,;]+/)) {
      const value = safeAddressee(part);
      if (!value || seen.has(value.toLocaleLowerCase())) continue;
      seen.add(value.toLocaleLowerCase());
      out.push(value);
      if (out.length >= MAX_NAMES) break;
    }
    return out;
  }, [raw]);

  const linkFor = (to: string, src?: Messenger) => {
    const url = `${permanentInviteUrl(slug)}?to=${encodeURIComponent(to)}`;
    return src ? withSrc(url, src) : url;
  };
  const textFor = (to: string) => `${to}, ${t('add.shareText', { name })}`;
  const markSent = (to: string) => setSent((list) => (list.includes(to) ? list : [...list, to]));

  return (
    <Sheet open={open} onClose={onClose} title={t('add.named.title')} description={t('add.named.hint')}>
      <Textarea
        aria-label={t('add.named.title')}
        value={raw}
        rows={4}
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => setRaw(event.target.value)}
      />
      {names.length > 0 ? (
        <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-lg bg-canvas">
          {names.map((to) => (
            <li key={to} className="flex min-h-row items-center gap-2 px-3.5 py-2">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-body font-body text-ink">{to}</span>
                {sent.includes(to) ? <IconCheck className="h-[18px] w-[18px] shrink-0 text-care" /> : null}
              </span>
              <MessengerIconButtons
                label={to}
                text={textFor(to)}
                urlFor={(messenger) => linkFor(to, messenger)}
                onOpen={() => markSent(to)}
              />
              <Button
                variant="icon"
                size="md"
                className="shrink-0"
                aria-label={`${t('add.share')}: ${to}`}
                onClick={() => {
                  void shareLink({ title: t('common.appName'), text: textFor(to), url: linkFor(to) })
                    .then((outcome) => {
                      if (outcome !== 'cancelled') markSent(to);
                    })
                    .catch(() => undefined);
                }}
              >
                <IconShare className="h-5 w-5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Sheet>
  );
}
