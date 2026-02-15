import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Pencil, HelpCircle, UserPlus } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { buildWebInviteUrl, buildBotInviteUrl } from '../lib/inviteUrl';
import { Tooltip } from './ui/tooltip';
import { Card, CardContent } from './ui/card';

interface InviteBlockProps {
  id?: string;
}

export function InviteBlock({ id }: InviteBlockProps) {
  const { t } = useTranslation();
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery();

  const [copiedWeb, setCopiedWeb] = useState(false);
  const [copiedBot, setCopiedBot] = useState(false);
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

  return (
    <Card id={id}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('network.invite')}</h3>
        </div>

        <div className="flex justify-center mb-4">
          <div className="p-3 bg-white rounded-xl">
            <QRCodeSVG value={webInviteUrl} size={200} level="H" imageSettings={{ src: '/logo-dark.png', width: 48, height: 34, excavate: true }} />
          </div>
        </div>

        <div className="space-y-2">
          {/* Web link */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(webInviteUrl);
              setCopiedWeb(true);
              setTimeout(() => setCopiedWeb(false), 2000);
            }}
            className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <span className="text-base shrink-0">🌐</span>
            <Tooltip content={t('invite.webLinkDesc')} side="top">
              <button type="button" className="shrink-0 text-gray-400 hover:text-gray-500"><HelpCircle className="w-3.5 h-3.5" /></button>
            </Tooltip>
            <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{webInviteUrl}</p>
            <div className="shrink-0">
              {copiedWeb ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
            </div>
          </button>
          {/* Bot link */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(botInviteUrl);
              setCopiedBot(true);
              setTimeout(() => setCopiedBot(false), 2000);
            }}
            className="w-full flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <span className="text-base shrink-0">🤖</span>
            <Tooltip content={t('invite.botLinkDesc')} side="top">
              <button type="button" className="shrink-0 text-gray-400 hover:text-gray-500"><HelpCircle className="w-3.5 h-3.5" /></button>
            </Tooltip>
            <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 break-all text-left">{botInviteUrl}</p>
            <div className="shrink-0">
              {copiedBot ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-gray-500" />}
            </div>
          </button>
        </div>

        {/* Editable slug */}
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-medium text-gray-500">{t('invite.yourCode')}</span>
            <Tooltip content={t('invite.slugDesc')} side="bottom">
              <button type="button" className="text-gray-400 hover:text-gray-500"><HelpCircle className="w-3.5 h-3.5" /></button>
            </Tooltip>
          </div>
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
              <p className="text-sm font-mono text-blue-600 dark:text-blue-400">{me?.referralSlug || userId}</p>
              <button onClick={() => { setSlugValue(me?.referralSlug || ''); setSlugError(''); setEditingSlug(true); }} className="text-gray-400 hover:text-gray-500">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
