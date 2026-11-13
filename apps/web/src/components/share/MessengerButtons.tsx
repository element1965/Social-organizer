import { SocialIcon } from '../ui/social-icons';
import { Button } from '../ui2/Button';
import { cn } from '../../lib/utils';
import { openMessengerShare, type Messenger } from '../../lib/messengerShare';

const MESSENGERS: Array<{ id: Messenger; icon: string; label: string }> = [
  { id: 'wa', icon: 'whatsapp', label: 'WhatsApp' },
  { id: 'tg', icon: 'telegram', label: 'Telegram' },
];

/**
 * "Send in WhatsApp" and "Send in Telegram": the messenger opens with the text and the link filled in,
 * the person picks the chat. `urlFor` gives the link for each messenger (it may carry `?src=`).
 */
export function MessengerButtons({
  text,
  urlFor,
  className,
  onOpen,
}: {
  text: string;
  urlFor: (messenger: Messenger) => string;
  className?: string;
  onOpen?: (messenger: Messenger) => void;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-2.5', className)}>
      {MESSENGERS.map((m) => (
        <Button
          key={m.id}
          variant="secondary"
          className="w-full min-w-0"
          icon={<SocialIcon type={m.icon} className="h-5 w-5 shrink-0" />}
          onClick={() => {
            openMessengerShare(m.id, text, urlFor(m.id));
            onOpen?.(m.id);
          }}
        >
          {m.label}
        </Button>
      ))}
    </div>
  );
}

/** The same two actions as compact icon buttons, for a row of a list. */
export function MessengerIconButtons({
  text,
  urlFor,
  label,
  onOpen,
}: {
  text: string;
  urlFor: (messenger: Messenger) => string;
  /** Who the message is for; read out with the messenger's name */
  label: string;
  onOpen?: (messenger: Messenger) => void;
}) {
  return (
    <>
      {MESSENGERS.map((m) => (
        <Button
          key={m.id}
          variant="icon"
          size="md"
          className="shrink-0"
          aria-label={`${m.label}: ${label}`}
          onClick={() => {
            openMessengerShare(m.id, text, urlFor(m.id));
            onOpen?.(m.id);
          }}
        >
          <SocialIcon type={m.icon} className="h-5 w-5" />
        </Button>
      ))}
    </>
  );
}
