import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Pencil, RefreshCw, UserPlus, Share2 } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { buildWebInviteUrl, buildBotInviteUrl } from '../lib/inviteUrl';
import { shareInviteLink } from '../lib/shareInvite';
import { Card, CardContent } from './ui/card';

interface InviteBlockProps {
  id?: string;
}

export function InviteBlock({ id }: InviteBlockProps) {
  const { t } = useTranslation();
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery();

  const [flipped, setFlipped] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedBot, setCopiedBot] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [editingSlug, setEditingSlug] = useState(false);
  const [slugValue, setSlugValue] = useState('');
  const [slugError, setSlugError] = useState('');
  const updateSlug = trpc.user.updateReferralSlug.useMutation({
    onSuccess: () => { utils.user.me.invalidate(); setEditingSlug(false); setSlugError(''); },
    onError: (err) => setSlugError(err.message),
  });

  const inviteToken = me?.referralSlug || userId || '';
  const webInviteUrl = inviteToken ? buildWebInviteUrl(inviteToken) : '';
  const botInviteUrl = inviteToken ? buildBotInviteUrl(inviteToken) : '';

  if (!webInviteUrl) return null;

  const handleCopyWeb = () => {
    navigator.clipboard.writeText(webInviteUrl);
    setCopiedWeb(true);
    setTimeout(() => setCopiedWeb(false), 2500);
  };

  const handleCopyBot = () => {
    navigator.clipboard.writeText(botInviteUrl);
    setCopiedBot(true);
    setTimeout(() => setCopiedBot(false), 2500);
  };

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareInviteLink({
        url: webInviteUrl,
        userName: me?.name || '',
        t,
      });
      if (result === 'copied') {
        setCopiedWeb(true);
        setTimeout(() => setCopiedWeb(false), 2500);
      } else {
        setShared(true);
        setTimeout(() => setShared(false), 2500);
      }
    } catch { /* ignore */ }
    setSharing(false);
  };

  const flipButton = (
    <button
      onClick={(e) => { e.stopPropagation(); setFlipped(!flipped); }}
      className="absolute top-0 right-0 p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors z-10"
      title={flipped ? t('invite.showWebLink') : t('invite.showBotLink')}
    >
      <RefreshCw className="w-4 h-4 text-gray-400 dark:text-gray-500" />
    </button>
  );

  return (
    <Card id={id}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('network.invite')}</h3>
        </div>

        <div className="flip-container">
          <div className={`flip-inner relative ${flipped ? 'flipped' : ''}`}>
            {/* ===== FRONT: QR code + website link ===== */}
            <div className={`flip-front ${flipped ? 'absolute top-0 left-0 w-full' : ''}`}>
              <div className="relative">
                {flipButton}
                <div className="flex flex-col items-center gap-3">
                  {/* QR code */}
                  <div className="p-3 bg-white rounded-xl">
                    <QRCodeSVG value={webInviteUrl} size={200} level="H" imageSettings={{ src: '/logo-dark.png', width: 48, height: 34, excavate: true }} />
                  </div>

                  {/* Instruction text */}
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('invite.sendThisLink')}
                  </p>

                  {/* Clickable link — copies on tap */}
                  <button
                    onClick={handleCopyWeb}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-800/70 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                  >
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 break-all text-center">
                      {webInviteUrl}
                    </p>
                  </button>

                  {/* Share button */}
                  <button
                    onClick={handleShare}
                    disabled={sharing}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-colors"
                  >
                    <Share2 className="w-5 h-5" />
                    <span className="font-semibold">{t('invite.share')}</span>
                  </button>

                  {/* Copied banner */}
                  {(copiedWeb || shared) && (
                    <div className="w-full flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-200 dark:border-green-800 animate-fade-in">
                      <Check className="w-6 h-6 text-green-500" />
                      <span className="text-base font-semibold text-green-600 dark:text-green-400">
                        {t('invite.copied')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ===== BACK: Bot link + slug editor ===== */}
            <div className={`flip-back ${flipped ? '' : 'absolute top-0 left-0 w-full'}`}>
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                {flipButton}
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 dark:text-gray-300 pr-8">
                    {t('invite.botLinkHint')}
                  </p>

                  {/* Bot link — copies on tap */}
                  <button
                    onClick={handleCopyBot}
                    className="w-full p-4 bg-gray-50 dark:bg-gray-800/70 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg shrink-0">🤖</span>
                      <p className="flex-1 text-sm font-medium text-blue-600 dark:text-blue-400 break-all text-left">
                        {botInviteUrl}
                      </p>
                    </div>
                  </button>

                  {/* Copied banner */}
                  {copiedBot && (
                    <div className="flex items-center justify-center gap-2 py-3 bg-green-50 dark:bg-green-950/40 rounded-xl border border-green-200 dark:border-green-800 animate-fade-in">
                      <Check className="w-6 h-6 text-green-500" />
                      <span className="text-base font-semibold text-green-600 dark:text-green-400">
                        {t('invite.copied')}
                      </span>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                    {t('invite.botLinkDesc')}
                  </p>

                  {/* Editable slug */}
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      {t('invite.slugExplain')}
                    </p>
                    {editingSlug ? (
                      <div>
                        <input
                          value={slugValue}
                          onChange={(e) => { setSlugValue(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')); setSlugError(''); }}
                          onBlur={() => { if (slugValue.length >= 3 && slugValue !== (me?.referralSlug || '')) updateSlug.mutate({ slug: slugValue }); else setEditingSlug(false); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && slugValue.length >= 3) updateSlug.mutate({ slug: slugValue }); if (e.key === 'Escape') setEditingSlug(false); }}
                          placeholder={t('invite.slugPlaceholder')}
                          className="w-full px-2 py-1 text-sm font-mono rounded border border-gray-300 dark:border-gray-600 bg-transparent text-blue-600 dark:text-blue-400 focus:outline-none focus:border-blue-500"
                          maxLength={30}
                          autoFocus
                        />
                        {slugError && <p className="text-[10px] text-red-500 mt-1">{slugError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{t('invite.yourId')}:</span>
                        <p className="text-sm font-mono text-blue-600 dark:text-blue-400">{me?.referralSlug || userId}</p>
                        <button onClick={() => { setSlugValue(me?.referralSlug || ''); setSlugError(''); setEditingSlug(true); }} className="text-gray-400 hover:text-gray-500 dark:text-gray-300">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
