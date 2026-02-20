import { useState, useRef } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Plus, Pencil, Trash2, X, Check, Globe, Loader2, ImagePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Card } from '../components/ui/card';

export function FaqPage() {
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
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const res = await fetch('/api/broadcast/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload failed' }));
        alert((err as { error?: string }).error || 'Upload failed');
        return;
      }

      const data = (await res.json()) as { fileId: string; mediaType: string };
      // Store as /api/media/<fileId> URL for display
      setFormImageUrl(`/api/media/${data.fileId}`);
    } catch {
      alert('Upload failed');
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

  const handleDelete = (id: string) => {
    if (!confirm(t('faq.deleteConfirm'))) return;
    deleteMutation.mutate({ id });
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

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pr-12">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-amber-500" />
          {t('faq.title')}
        </h1>
        {isAdmin && !showForm && !editingId && (
          <div className="flex items-center gap-2">
            {displayItems.some(i => !(i as typeof i & { isLocalized?: boolean }).isLocalized) && (
              <button
                onClick={() => localizeAllMutation.mutate()}
                disabled={localizeAllMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {localizeAllMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Globe className="w-4 h-4" />
                )}
                {t('faq.localizeAll')}
              </button>
            )}
            <button
              onClick={() => { setShowForm(true); setFormQuestion(''); setFormAnswer(''); setFormImageUrl(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('faq.addItem')}
            </button>
          </div>
        )}
      </div>

      {/* Create / Edit form */}
      {(showForm || editingId) && (
        <Card className="mb-4 p-4">
          <textarea
            value={formQuestion}
            onChange={e => setFormQuestion(e.target.value)}
            placeholder={t('faq.questionPlaceholder')}
            className="w-full mb-2 p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            rows={2}
          />
          <textarea
            value={formAnswer}
            onChange={e => setFormAnswer(e.target.value)}
            placeholder={t('faq.answerPlaceholder')}
            className="w-full mb-3 p-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            rows={4}
          />
          {/* Image upload */}
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
                <img src={formImageUrl} alt="" className="max-h-32 rounded-lg border border-gray-200 dark:border-gray-700" />
                <button
                  onClick={() => setFormImageUrl(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4" />
                )}
                {t('faq.addPhoto')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={editingId ? handleUpdate : handleCreate}
              disabled={!formQuestion.trim() || !formAnswer.trim() || createMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Check className="w-4 h-4" />
              {t('common.save')}
            </button>
            <button
              onClick={cancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
              {t('common.cancel')}
            </button>
          </div>
        </Card>
      )}

      {/* FAQ items accordion */}
      {isLoading ? (
        <p className="text-center text-gray-500 dark:text-gray-300 py-8">{t('common.loading')}</p>
      ) : displayItems.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-300 py-8">{t('faq.empty')}</p>
      ) : (
        <div className="space-y-2">
          {displayItems.map(item => {
            const isExpanded = openId === item.id;
            const isBeingEdited = editingId === item.id;
            const faqItem = item as typeof item & { isLocalized?: boolean; imageUrl?: string | null };
            return (
              <Card key={item.id} className="overflow-hidden">
                <button
                  onClick={() => handleToggle(item.id)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white pr-2">
                    {item.question}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                </button>
                {isExpanded && !isBeingEdited && (
                  <div className="px-4 pb-4">
                    {faqItem.imageUrl && (
                      <img
                        src={faqItem.imageUrl}
                        alt=""
                        className="max-w-full rounded-lg mb-3 border border-gray-200 dark:border-gray-700"
                      />
                    )}
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {item.answer}
                    </p>
                    {isAdmin && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <button
                          onClick={() => startEdit({ ...item, imageUrl: faqItem.imageUrl })}
                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-300 hover:text-blue-600 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-300 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => localizeMutation.mutate({ id: item.id })}
                          disabled={localizeMutation.isPending}
                          className={`flex items-center gap-1 text-xs transition-colors ml-1 ${
                            faqItem.isLocalized
                              ? 'text-emerald-500 hover:text-emerald-600'
                              : 'text-gray-400 hover:text-emerald-600'
                          }`}
                          title={faqItem.isLocalized ? t('faq.localized') : t('faq.localizeAll')}
                        >
                          {localizeMutation.isPending ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Globe className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
