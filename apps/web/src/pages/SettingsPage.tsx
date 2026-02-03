import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select } from '../components/ui/select';
import { Avatar } from '../components/ui/avatar';
import { Spinner } from '../components/ui/spinner';
import { Settings, Globe, Palette, Volume2, Link, UserX, Trash2, LogOut, Type, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { languageNames } from '@so/i18n';
import { Input } from '../components/ui/input';
import { SocialIcon } from '../components/ui/social-icons';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const { mode, setMode } = useTheme();
  const utils = trpc.useUtils();

  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const { data: ignoreList } = trpc.settings.ignoreList.useQuery();
  const { data: contacts } = trpc.user.getContacts.useQuery({});
  const updateContacts = trpc.user.updateContacts.useMutation({
    onSuccess: () => utils.user.getContacts.invalidate(),
  });
  const [contactValues, setContactValues] = useState<Record<string, string>>({});
  const updateLanguage = trpc.settings.updateLanguage.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateTheme = trpc.settings.updateTheme.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateSound = trpc.settings.updateSound.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateFontScale = trpc.settings.updateFontScale.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const removeIgnore = trpc.settings.removeIgnore.useMutation({ onSuccess: () => utils.settings.ignoreList.invalidate() });
  const generateCode = trpc.auth.generateLinkCode.useMutation();
  const deleteAccount = trpc.user.delete.useMutation({ onSuccess: () => { logout(); navigate('/login'); } });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleLanguageChange = (lang: string) => { i18n.changeLanguage(lang); localStorage.setItem('language', lang); updateLanguage.mutate({ language: lang }); };
  const handleThemeChange = (theme: 'LIGHT' | 'DARK' | 'SYSTEM') => { setMode(theme.toLowerCase() as 'light' | 'dark' | 'system'); updateTheme.mutate({ theme }); };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Settings className="w-5 h-5" /> {t('settings.title', 'Настройки')}
      </h1>

      <Card><CardContent className="py-3"><div className="flex items-center gap-3"><Globe className="w-5 h-5 text-gray-500 shrink-0" />
        <Select id="language" label={t('settings.language', 'Язык')} value={settings?.language || 'en'} onChange={(e) => handleLanguageChange(e.target.value)} options={Object.entries(languageNames).map(([code, name]) => ({ value: code, label: name }))} />
      </div></CardContent></Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3 mb-2"><Palette className="w-5 h-5 text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.theme', 'Тема')}</span></div>
        <div className="grid grid-cols-3 gap-2">
          {(['LIGHT', 'DARK', 'SYSTEM'] as const).map((th) => (
            <button key={th} onClick={() => handleThemeChange(th)} className={cn('py-2 rounded-lg text-sm font-medium border transition-colors', mode === th.toLowerCase() ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400')}>
              {th === 'LIGHT' ? t('settings.light', 'Светлая') : th === 'DARK' ? t('settings.dark', 'Тёмная') : t('settings.system', 'Авто')}
            </button>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="py-3"><div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Volume2 className="w-5 h-5 text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.sound', 'Звуки')}</span></div>
        <button onClick={() => updateSound.mutate({ soundEnabled: !settings?.soundEnabled })} className={cn('w-12 h-6 rounded-full transition-colors relative', settings?.soundEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')}>
          <div className={cn('w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all', settings?.soundEnabled ? 'left-6' : 'left-0.5')} />
        </button>
      </div></CardContent></Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3 mb-2"><Type className="w-5 h-5 text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.fontSize', 'Размер шрифта')}</span></div>
        <div className="grid grid-cols-2 gap-2">
          {([{ value: 1.0, label: 'settings.fontStandard', fallback: 'Стандартный' }, { value: 1.25, label: 'settings.fontLarge', fallback: 'Увеличенный' }] as const).map((opt) => (
            <button key={opt.value} onClick={() => { updateFontScale.mutate({ fontScale: opt.value }); document.documentElement.style.fontSize = `${opt.value * 100}%`; }} className={cn('py-2 rounded-lg text-sm font-medium border transition-colors', (settings?.fontScale ?? 1.0) === opt.value ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400')}>
              {t(opt.label, opt.fallback)}
            </button>
          ))}
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('settings.contacts')}</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('settings.contactsDesc')}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {contacts?.map((contact) => (
            <div key={contact.type} className="flex items-center gap-2">
              <SocialIcon type={contact.icon} className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <Input
                id={`contact-${contact.type}`}
                placeholder={contact.placeholder}
                value={contactValues[contact.type] ?? contact.value}
                onChange={(e) => setContactValues(prev => ({ ...prev, [contact.type]: e.target.value }))}
                className="flex-1"
              />
            </div>
          ))}
          {contacts && contacts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                const updates = contacts.map(c => ({
                  type: c.type,
                  value: contactValues[c.type] ?? c.value,
                }));
                updateContacts.mutate(updates);
              }}
              disabled={updateContacts.isPending}
            >
              {updateContacts.isPending ? t('common.loading') : t('common.save')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3 mb-2"><Link className="w-5 h-5 text-gray-500" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.linkAccount', 'Связать аккаунт')}</span></div>
        {generateCode.data ? (
          <div className="text-center py-2"><p className="text-3xl font-mono font-bold text-blue-600 tracking-widest">{generateCode.data.code}</p><p className="text-xs text-gray-500 mt-1">{t('settings.codeExpires', 'Действителен 5 минут')}</p></div>
        ) : <Button variant="outline" size="sm" onClick={() => generateCode.mutate()} className="w-full">{t('settings.generateCode', 'Сгенерировать код')}</Button>}
      </CardContent></Card>

      <Card>
        <CardHeader><div className="flex items-center gap-2"><UserX className="w-5 h-5 text-gray-500" /><h2 className="font-semibold text-gray-900 dark:text-white">{t('settings.ignoreList', 'Игнор-лист')}</h2></div></CardHeader>
        <CardContent>
          {!ignoreList || ignoreList.length === 0 ? <p className="text-sm text-gray-500 text-center py-2">{t('settings.noIgnored', 'Список пуст')}</p> : (
            <div className="space-y-2">
              {ignoreList.map((entry) => (
                <div key={entry.toUser.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Avatar src={entry.toUser.photoUrl} name={entry.toUser.name} size="sm" /><span className="text-sm text-gray-900 dark:text-white">{entry.toUser.name}</span></div>
                  <Button variant="ghost" size="sm" onClick={() => removeIgnore.mutate({ userId: entry.toUser.id })}>{t('settings.unignore', 'Убрать')}</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => { logout(); navigate('/login'); }}><LogOut className="w-4 h-4 mr-2" /> {t('settings.logout', 'Выйти')}</Button>

      <div className="pt-4">
        {!confirmDelete ? (
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4 mr-2" /> {t('settings.deleteAccount', 'Удалить аккаунт')}</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-500 text-center">{t('settings.deleteConfirm', 'Вы уверены? Это действие необратимо.')}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>{t('common.cancel', 'Отмена')}</Button>
              <Button variant="danger" className="flex-1" onClick={() => deleteAccount.mutate()}>{t('settings.confirmDelete', 'Удалить')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
