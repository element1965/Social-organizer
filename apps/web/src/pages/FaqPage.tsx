import { useRef, useState } from 'react';
import { Check, Globe, ImagePlus, Link2, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc, authFetch } from '../lib/trpc';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Group } from '../components/ui2/Group';
import { Sheet } from '../components/ui2/Sheet';
import { IconChevron } from '../components/ui2/icons';
import { cn } from '../lib/utils';

// FAQ content lives in the DB (one row per language, translations share groupId = source item id).

const fieldCls =
  'w-full rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-body-s font-semibold text-ink outline-none placeholder:text-ink-subtle focus:border-care';

/** http(s), mailto, tel, or a site path. Anything else is shown as plain text. */
const SAFE_FAQ_URL = /^(https?:|mailto:|tel:|\/)/i;

/** Render text with markdown-style links: [label](url). */
function FaqAnswer({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return (
    <p className="whitespace-pre-wrap text-body-s text-ink-muted">
      {parts.map((part, i) => {
        const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        const label = match?.[1];
        const rawUrl = match?.[2];
        if (!label || rawUrl === undefined) return <span key={i}>{part}</span>;
        const url = rawUrl.trim();
        if (!SAFE_FAQ_URL.test(url)) return <span key={i}>{label}</span>;
        const external = /^https?:/i.test(url);
        return (
          <a
            key={i}
            href={url}
            className="font-semibold text-link underline"
            {...(external ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {})}
          >
            {label}
          </a>
        );
      })}
    </p>
  );
}

export function FaqPage({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.split('-')[0] || 'ru';
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.faq.list.useQuery({ language: lang });
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isAdmin = adminData?.isAdmin ?? false;

  // If no items for current language, try Russian fallback
  const { data: fallbackItems = [] } = trpc.faq.list.useQuery(
    { language: 'ru' },
    { enabled: items.length === 0 && lang !== 'ru' && !isLoading },
  );
  const displayItems = items.length > 0 ? items : fallbackItems;

  const createMutation = trpc.faq.create.useMutation({ onSuccess: () => utils.faq.list.invalidate() });
  const updateMutation = trpc.faq.update.useMutation({ onSuccess: () => utils.faq.list.invalidate() });
  const deleteMutation = trpc.faq.delete.useMutation({ onSuccess: () => utils.faq.list.invalidate() });
  const incrementViewMutation = trpc.faq.incrementView.useMutation();
  const localizeMutation = trpc.faq.localize.useMutation({ onSuccess: () => utils.faq.list.invalidate() });

  const localizeAllMutation = trpc.faq.localizeAll.useMutation({ onSuccess: () => utils.faq.list.invalidate() });

  const [openId, setOpenId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const handleToggle = (id: string) => {
    const isOpening = openId !== id;
    setOpenId(prev => prev === id ? null : id);
    if (isOpening) {
      incrementViewMutation.mutate({ id });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/broadcast/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error || t('faq.uploadFailed'));
        return;
      }

      const data = (await res.json()) as { fileId: string; mediaType: string };
      // Store as /api/media/<fileId> URL for display
      setFormImageUrl(`/api/media/${data.fileId}`);
    } catch {
      alert(t('faq.uploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreate = () => {
    if (!formQuestion.trim() || !formAnswer.trim()) return;
    createMutation.mutate(
      { question: formQuestion.trim(), answer: formAnswer.trim(), imageUrl: formImageUrl, language: lang, sortOrder: displayItems.length + 1 },
      {
        onSuccess: () => {
          setFormQuestion('');
          setFormAnswer('');
          setFormImageUrl(null);
          setShowForm(false);
        },
      },
    );
  };

  const handleUpdate = () => {
    if (!editingId || !formQuestion.trim() || !formAnswer.trim()) return;
    updateMutation.mutate(
      { id: editingId, question: formQuestion.trim(), answer: formAnswer.trim(), imageUrl: formImageUrl },
      {
        onSuccess: () => {
          setEditingId(null);
          setFormQuestion('');
          setFormAnswer('');
          setFormImageUrl(null);
        },
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    deleteMutation.mutate({ id: deleteId });
    setDeleteId(null);
  };

  const startEdit = (item: { id: string; question: string; answer: string; imageUrl?: string | null }) => {
    setEditingId(item.id);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setFormImageUrl(item.imageUrl ?? null);
    setShowForm(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormImageUrl(null);
    setShowForm(false);
  };

  const showAdminTools = isAdmin && !showForm && !editingId;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className={embedded ? '' : 'mx-auto max-w-2xl pb-24'}>
      {showAdminTools && (
        <div className="mb-3 flex items-center justify-end gap-2">
          {displayItems.some(i => !(i as typeof i & { isLocalized?: boolean }).isLocalized) && (
            <Button size="md" variant="secondary" onClick={() => localizeAllMutation.mutate()} loading={localizeAllMutation.isPending} icon={<Globe className="h-4 w-4" />}>
              {t('faq.localizeAll')}
            </Button>
          )}
          <Button
            size="md"
            onClick={() => { setShowForm(true); setFormQuestion(''); setFormAnswer(''); setFormImageUrl(null); }}
            icon={<span className="text-body-l leading-none">+</span>}
          >
            {t('faq.addItem')}
          </Button>
        </div>
      )}

      {(showForm || editingId) && (
        <Card className="mb-4">
          <textarea
            value={formQuestion}
            onChange={e => setFormQuestion(e.target.value)}
            placeholder={t('faq.questionPlaceholder')}
            className={cn(fieldCls, 'mb-2 resize-y')}
            rows={2}
          />
          <textarea
            ref={answerRef}
            value={formAnswer}
            onChange={e => setFormAnswer(e.target.value)}
            placeholder={t('faq.answerPlaceholder')}
            className={cn(fieldCls, 'mb-2 resize-y')}
            rows={4}
          />
          <div className="relative mb-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => { setShowLinkPopup(!showLinkPopup); setLinkText(''); setLinkUrl(''); }}
              icon={<Link2 className="h-4 w-4" />}
            >
              {t('faq.insertLink')}
            </Button>
            {showLinkPopup && (
              <div className="absolute left-0 top-full z-10 mt-1 w-72 space-y-2 rounded-xl border border-line bg-surface p-3 shadow-float">
                <input
                  type="text"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  placeholder={t('faq.linkTextPlaceholder')}
                  className={fieldCls}
                />
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder={t('faq.urlPlaceholder')}
                  className={fieldCls}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="md"
                    disabled={!linkText.trim() || !linkUrl.trim()}
                    onClick={() => {
                      const md = `[${linkText.trim()}](${linkUrl.trim()})`;
                      const ta = answerRef.current;
                      if (ta) {
                        const start = ta.selectionStart ?? formAnswer.length;
                        const before = formAnswer.slice(0, start);
                        const after = formAnswer.slice(ta.selectionEnd ?? start);
                        setFormAnswer(before + md + after);
                        setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + md.length; }, 0);
                      } else {
                        setFormAnswer(prev => prev + md);
                      }
                      setShowLinkPopup(false);
                    }}
                    icon={<Check className="h-4 w-4" />}
                  >
                    {t('faq.insert')}
                  </Button>
                  <Button type="button" variant="text" size="md" onClick={() => setShowLinkPopup(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {formImageUrl ? (
              <div className="relative inline-block">
                <img src={formImageUrl} alt="" className="max-h-32 rounded-lg border border-line" />
                <button
                  type="button"
                  onClick={() => setFormImageUrl(null)}
                  aria-label={t('common.close')}
                  className="so-focus absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-sos text-sos-on"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="md"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                loading={uploading}
                icon={<ImagePlus className="h-4 w-4" />}
              >
                {t('faq.addPhoto')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="md"
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={!formQuestion.trim() || !formAnswer.trim()}
              loading={saving}
              icon={<Check className="h-4 w-4" />}
            >
              {t('common.save')}
            </Button>
            <Button variant="secondary" size="md" onClick={cancelEdit} icon={<X className="h-4 w-4" />}>
              {t('common.cancel')}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <p className="py-8 text-center text-body-s text-ink-muted">{t('common.loading')}</p>
      ) : displayItems.length === 0 ? (
        <p className="py-8 text-center text-body-s text-ink-muted">{t('faq.empty')}</p>
      ) : (
        <Group>
          {displayItems.map(item => {
            const isExpanded = openId === item.id;
            const isBeingEdited = editingId === item.id;
            const faqItem = item as typeof item & { isLocalized?: boolean; imageUrl?: string | null };
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => handleToggle(item.id)}
                  aria-expanded={isExpanded}
                  className="so-focus flex min-h-row w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0 flex-1 text-body font-body text-ink">{item.question}</span>
                  <IconChevron className={cn('h-[18px] w-[18px] shrink-0 text-ink-subtle transition-transform duration-fast', isExpanded && 'rotate-90')} />
                </button>
                {isExpanded && !isBeingEdited && (
                  <div className="px-4 pb-4">
                    {faqItem.imageUrl && (
                      <img
                        src={faqItem.imageUrl}
                        alt=""
                        className="mb-3 max-w-full rounded-lg border border-line"
                      />
                    )}
                    <FaqAnswer text={item.answer} />
                    {isAdmin && (
                      <div className="mt-3 flex items-center gap-1 border-t border-line-soft pt-2">
                        <Button
                          variant="icon"
                          aria-label={t('faq.edit')}
                          onClick={() => startEdit({ ...item, imageUrl: faqItem.imageUrl })}
                          icon={<Pencil className="h-4 w-4" />}
                        />
                        <Button
                          variant="icon"
                          className="text-sos"
                          aria-label={t('faq.deleteConfirm')}
                          onClick={() => setDeleteId(item.id)}
                          icon={<Trash2 className="h-4 w-4" />}
                        />
                        <Button
                          variant="icon"
                          className={faqItem.isLocalized ? 'text-care' : 'text-ink-subtle'}
                          aria-label={faqItem.isLocalized ? t('faq.localized') : t('faq.localizeAll')}
                          title={faqItem.isLocalized ? t('faq.localized') : t('faq.localizeAll')}
                          onClick={() => localizeMutation.mutate({ id: item.id })}
                          disabled={localizeMutation.isPending}
                          icon={localizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Group>
      )}

      <Sheet
        open={deleteId != null}
        onClose={() => setDeleteId(null)}
        title={t('faq.deleteConfirm')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleteMutation.isPending}>
              {t('common.confirm')}
            </Button>
          </>
        }
      />
    </div>
  );
}
