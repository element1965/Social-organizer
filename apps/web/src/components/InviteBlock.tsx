import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Pencil, RefreshCw, Share2, X } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { buildWebInviteUrl, buildBotInviteUrl } from '../lib/inviteUrl';
import { shareInviteLink } from '../lib/shareInvite';
import { Card, CardContent } from './ui/card';

interface InviteBlockProps {
  id?: string;
  /** 'qr' = QR + flip only, 'actions' = link + share only, 'full' = everything (default) */
  variant?: 'full' | 'qr' | 'actions';
}

export function InviteBlock({ id, variant = 'full' }: InviteBlockProps) {
  const { t } = useTranslation();
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery();

  const [flipped, setFlipped] = useState(false);
  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedBot, setCopiedBot] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
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


  // --- Actions: link + share button ---
  const actionsContent = (
    <div className="flex flex-col gap-2">
      {/* Clickable link — copies on tap */}
      <button
        onClick={handleCopyWeb}
        className="w-full p-2 bg-gray-50 dark:bg-gray-800/70 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
      >
        <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 break-all text-center leading-tight">
          {webInviteUrl}
        </p>
      </button>

      {/* Share button */}
      <button
        onClick={handleShare}
        disabled={sharing}
        className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
      >
        <Share2 className="w-4 h-4" />
        <span className="text-sm font-semibold">{t('invite.share')}</span>
      </button>

      {/* Copied banner */}
      {(copiedWeb || shared) && (
        <div className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-800 animate-fade-in">
          <Check className="w-4 h-4 text-green-500" />
          <span className="text-xs font-semibold text-green-600 dark:text-green-400">{t('invite.copied')}</span>
        </div>
      )}
    </div>
  );

  // --- QR: QR code with flip to bot link ---
  const qrContent = (
    <>
      {/* QR Code enlarged modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setQrModalOpen(false)}>
          <div className="bg-white rounded-2xl p-6 mx-4 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setQrModalOpen(false)} className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <QRCodeSVG value={webInviteUrl} size={280} level="H" imageSettings={{ src: '/logo-dark.png', width: 60, height: 43, excavate: true }} />
          </div>
        </div>
      )}

      <Card id={id}>
        <CardContent className="py-3">
          <div className="flex justify-end mb-1">
            <button
              onClick={() => setFlipped(!flipped)}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={flipped ? t('invite.showWebLink') : t('invite.showBotLink')}
            >
              <RefreshCw className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          <div className="flip-container">
            <div className={`flip-inner relative ${flipped ? 'flipped' : ''}`}>
              {/* ===== FRONT: QR code ===== */}
              <div className={`flip-front ${flipped ? 'absolute top-0 left-0 w-full' : ''}`}>
                <div className="flex justify-center">
                  <button onClick={() => setQrModalOpen(true)} className="p-2 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                    <QRCodeSVG value={webInviteUrl} size={160} level="H" imageSettings={{ src: '/logo-dark.png', width: 38, height: 27, excavate: true }} />
                  </button>
                </div>
              </div>

              {/* ===== BACK: Bot link + slug editor ===== */}
              <div className={`flip-back ${flipped ? '' : 'absolute top-0 left-0 w-full'}`}>
                <div onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600 dark:text-gray-300">
                      {t('invite.botLinkHint')}
                    </p>

                    <button
                      onClick={handleCopyBot}
                      className="w-full p-2.5 bg-gray-50 dark:bg-gray-800/70 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base shrink-0">🤖</span>
                        <p className="flex-1 text-xs font-medium text-blue-600 dark:text-blue-400 break-all text-left">
                          {botInviteUrl}
                        </p>
                      </div>
                    </button>

                    {copiedBot && (
                      <div className="flex items-center justify-center gap-1.5 py-2 bg-green-50 dark:bg-green-950/40 rounded-lg border border-green-200 dark:border-green-800 animate-fade-in">
                        <Check className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-semibold text-green-600 dark:text-green-400">{t('invite.copied')}</span>
                      </div>
                    )}

                    <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                      {t('invite.botLinkDesc')}
                    </p>

                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
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
    </>
  );

  if (variant === 'qr') return qrContent;
  if (variant === 'actions') return actionsContent;

  // full = both together (legacy)
  return (
    <>
      {qrContent}
      {actionsContent}
    </>
  );
}
