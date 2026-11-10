import { useTranslation } from 'react-i18next';
import { isTelegramWebApp } from '@so/tg-adapter';
import { useSavedCopy } from '../../hooks/useSavedCopy';
import { Avatar } from '../ui2/Avatar';
import { Screen } from '../ui2/Screen';
import { SocialIcon } from '../ui/social-icons';
import { contactHref } from '../person/contactHref';
import { OfflineNotice } from './OfflineNotice';

/** Offline person page: name, handshake level and the contact links saved while online. */
export function SavedPerson({ id }: { id: string }) {
  const { t } = useTranslation();
  const { status, model, contacts } = useSavedCopy(true);
  const person = model?.byId.get(id);
  const saved = contacts[id];
  const back = { label: t('nav.circle'), to: '/' };

  if (status === 'loading') {
    return (
      <Screen back={back} width="column">
        <p className="py-8 text-center text-body font-semibold text-ink-muted">{t('common.loading')}</p>
      </Screen>
    );
  }

  const items = (saved?.contacts ?? []).filter((c) => contactHref(c.type, c.value));
  const ring = person ? t(`circle.rings.full${person.depth}`) : '';
  const line = [ring, person?.via.length ? t('person.via', { name: person.via[person.via.length - 1] }) : ''].filter(Boolean).join(' · ');

  return (
    <Screen back={back} width="column">
      <div className="flex flex-col gap-4 pt-2">
        <OfflineNotice syncedAt={model?.syncedAt} />
        {person ? (
          <div className="flex items-center gap-4">
            {/* Photos are not kept on the device: the letter stands in */}
            <Avatar name={person.name} size={88} />
            <div className="min-w-0">
              <h2 className="truncate text-title font-bold text-ink">{person.name}</h2>
              {line ? <p className="mt-0.5 text-label font-semibold text-ink-muted">{line}</p> : null}
              {person.accountName !== person.name ? (
                <p className="mt-1 text-label font-semibold text-ink-muted">{t('person.accountName', { name: person.accountName })}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-body font-semibold text-ink">{t('common.notFound')}</p>
        )}

        {person?.depth === 1 ? (
          <section>
            <h2 className="mb-2 px-1 text-label font-bold text-ink-muted">{t('person.contacts')}</h2>
            {items.length === 0 ? (
              <p className="px-1 text-body-s font-semibold text-ink-muted">
                {saved ? t('person.noContacts') : t('offline.contactsNotSaved')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {items.map((contact) => (
                  <a
                    key={contact.type}
                    href={contactHref(contact.type, contact.value)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      const href = contactHref(contact.type, contact.value);
                      if (isTelegramWebApp() && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                        event.preventDefault();
                        window.Telegram?.WebApp?.openLink?.(href, { try_instant_view: false });
                      }
                    }}
                    className="so-focus inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-surface-2 px-3.5 text-body-s font-bold text-ink"
                  >
                    <SocialIcon type={contact.type} className="h-5 w-5" />
                    {contact.type === 'phone' ? t('profile.phone') : t(`contacts.${contact.type}`, { defaultValue: contact.type })}
                  </a>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </Screen>
  );
}
