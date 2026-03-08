import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check, Link2 } from 'lucide-react';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { useNicknames } from '../hooks/useNicknames';
import { Avatar } from './ui/avatar';
import { SocialIcon } from './ui/social-icons';

interface ShareSheetProps {
  open: boolean;
  onClose: () => void;
  url: string;
  shareText: string;
}

const SOCIAL_APPS = [
  { id: 'telegram', label: 'Telegram', color: '#26A5E4', buildUrl: (url: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', buildUrl: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}` },
  { id: 'viber', label: 'Viber', color: '#7360F2', buildUrl: (url: string, text: string) => `viber://forward?text=${encodeURIComponent(text + '\n' + url)}` },
  { id: 'facebook', label: 'Facebook', color: '#1877F2', buildUrl: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
  { id: 'twitter', label: 'X', color: '#000000', buildUrl: (url: string, text: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}` },
  { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', buildUrl: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
  { id: 'instagram', label: 'Instagram', color: '#E4405F', buildUrl: () => null },
  { id: 'email', label: 'Email', color: '#6B7280', buildUrl: (url: string, text: string) => `mailto:?subject=${encodeURIComponent('Social Organizer')}&body=${encodeURIComponent(text + '\n' + url)}` },
] as const;

export function ShareSheet({ open, onClose, url, shareText }: ShareSheetProps) {
  const { t } = useTranslation();
  const resolve = useNicknames();
  const { data: networkStats } = useCachedNetworkStats();
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Animate in/out
  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!visible) return null;

  const contacts = ((networkStats as any)?.usersByDepth?.[1] ?? []).slice(0, 20) as Array<{
    id: string;
    name: string;
    photoUrl: string | null;
  }>;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = (app: typeof SOCIAL_APPS[number]) => {
    const shareUrl = app.buildUrl(url, shareText);
    if (!shareUrl) {
      // Instagram — just copy
      handleCopy();
      return;
    }
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  const handleContactShare = (contactName: string) => {
    // Use Web Share API if available, otherwise copy
    if (navigator.share) {
      navigator.share({
        title: 'Social Organizer',
        text: shareText,
        url,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[60] bg-black transition-opacity duration-300 ${animating ? 'opacity-50' : 'opacity-0'}`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[61] bg-white dark:bg-gray-900 rounded-t-2xl transition-transform duration-300 ease-out ${animating ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '70vh' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="w-8" />
          <h3 className="text-base font-bold text-gray-900 dark:text-white">{t('invite.share')}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 60px)' }}>
          {/* Row 1: Frequent contacts */}
          {contacts.length > 0 && (
            <div className="mb-4">
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => handleContactShare(contact.name)}
                    className="flex flex-col items-center gap-1 shrink-0 w-16"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <Avatar src={contact.photoUrl} name={resolve(contact.id, contact.name)} size="lg" />
                    </div>
                    <span className="text-[10px] text-gray-700 dark:text-gray-300 text-center leading-tight line-clamp-2 w-full">
                      {resolve(contact.id, contact.name)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          {contacts.length > 0 && <div className="border-t border-gray-100 dark:border-gray-800 mb-4" />}

          {/* Row 2: Social apps */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            {SOCIAL_APPS.map((app) => (
              <button
                key={app.id}
                onClick={() => handleShare(app)}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: app.color }}
                >
                  <SocialIcon type={app.id} className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] text-gray-600 dark:text-gray-400 text-center leading-tight">
                  {app.label}
                </span>
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 dark:border-gray-800 mb-4" />

          {/* Copy link button */}
          <button
            onClick={handleCopy}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-colors ${
              copied
                ? 'bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                {t('invite.copied')}
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                {t('invite.copyLink')}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
