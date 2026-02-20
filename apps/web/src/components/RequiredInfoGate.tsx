import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { SocialIcon } from './ui/social-icons';
import { MessageCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateContact } from '@so/shared';

const CONTACT_FIELDS = [
  { type: 'whatsapp', placeholder: '+380...' },
  { type: 'facebook', placeholder: 'facebook.com/...' },
  { type: 'instagram', placeholder: '@username' },
  { type: 'twitter', placeholder: '@username' },
  { type: 'tiktok', placeholder: '@username' },
] as const;

export function RequiredInfoGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { data: info, isLoading } = trpc.user.checkRequiredInfo.useQuery();
  const utils = trpc.useUtils();

  const needsContacts = info?.needsContacts ?? false;
  const showGate = !isLoading && needsContacts;

  // Contacts state
  const [contacts, setContacts] = useState<Record<string, string>>({
    whatsapp: '',
    facebook: '',
    instagram: '',
    twitter: '',
    tiktok: '',
  });

  const updateContacts = trpc.user.updateContacts.useMutation();

  const contactErrors = Object.fromEntries(
    Object.entries(contacts).map(([type, value]) => [type, validateContact(type, value)])
  );
  const filledContactsCount = Object.entries(contacts).filter(([type, v]) => v.trim() && !contactErrors[type]).length;
  const contactsValid = filledContactsCount >= 2;

  const handleContactsSave = async () => {
    const contactsArray = Object.entries(contacts)
      .map(([type, value]) => ({ type, value }));
    await updateContacts.mutateAsync(contactsArray);
    await utils.user.checkRequiredInfo.invalidate();
  };

  if (!showGate) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <MessageCircle className="w-6 h-6 text-blue-500" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('requiredInfo.contactsTitle')}</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('requiredInfo.contactsText')}</p>
        <div className="space-y-3">
          {CONTACT_FIELDS.map((field) => (
            <div key={field.type} className="flex items-center gap-2">
              <SocialIcon type={field.type} className="w-5 h-5 text-gray-500 dark:text-gray-300 shrink-0" />
              <Input
                value={contacts[field.type] || ''}
                onChange={(e) => setContacts(prev => ({ ...prev, [field.type]: e.target.value }))}
                placeholder={field.placeholder}
                className="flex-1"
                error={contacts[field.type]?.trim() && contactErrors[field.type] ? t(contactErrors[field.type]!) : undefined}
              />
            </div>
          ))}
        </div>
        <p className={cn(
          'text-sm font-medium',
          contactsValid ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-300'
        )}>
          {t('requiredInfo.contactsFilled', { count: filledContactsCount })}
        </p>
        <Button
          className="w-full"
          size="lg"
          onClick={handleContactsSave}
          disabled={!contactsValid || updateContacts.isPending}
        >
          {t('requiredInfo.save')}
        </Button>
      </div>
    </div>
  );
}
