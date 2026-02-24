import { useState, useEffect, useRef, useCallback } from 'react';
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
import { Settings, Globe, Palette, Volume2, Bell, Mic, Link, Trash2, LogOut, Type, Users, Camera, Pencil, Check, HelpCircle, EyeOff, Wrench } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import { languageNames } from '@so/i18n';
import { Input } from '../components/ui/input';
import { SocialIcon } from '../components/ui/social-icons';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { validateContact } from '@so/shared';
import { SkillSelector } from '../components/SkillSelector';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const { mode, setMode } = useTheme();
  const utils = trpc.useUtils();

  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const { data: contacts } = trpc.user.getContacts.useQuery({});
  const { data: me } = trpc.user.me.useQuery();
  const [savedTypes, setSavedTypes] = useState<Record<string, boolean>>({});
  const [contactValues, setContactValues] = useState<Record<string, string>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const updateContacts = trpc.user.updateContacts.useMutation({
    onSuccess: () => utils.user.getContacts.invalidate(),
  });

  const autosaveContact = useCallback((type: string, value: string) => {
    if (debounceTimers.current[type]) clearTimeout(debounceTimers.current[type]);
    debounceTimers.current[type] = setTimeout(() => {
      if (!contacts) return;
      if (validateContact(type, value)) return; // skip save if invalid
      const updates = contacts.map(c => ({
        type: c.type,
        value: type === c.type ? value : (contactValues[c.type] ?? c.value),
      }));
      updateContacts.mutate(updates, {
        onSuccess: () => {
          setSavedTypes(prev => ({ ...prev, [type]: true }));
          setTimeout(() => setSavedTypes(prev => ({ ...prev, [type]: false })), 1500);
        },
      });
    }, 500);
  }, [contacts, contactValues, updateContacts]);

  const [nameSaved, setNameSaved] = useState(false);
  const nameDebounce = useRef<ReturnType<typeof setTimeout>>();
  const updateLanguage = trpc.settings.updateLanguage.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateTheme = trpc.settings.updateTheme.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateSound = trpc.settings.updateSound.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateVoiceGender = trpc.settings.updateVoiceGender.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateFontScale = trpc.settings.updateFontScale.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const updateHideContacts = trpc.settings.updateHideContacts.useMutation({ onSuccess: () => utils.settings.get.invalidate() });
  const generateCode = trpc.auth.generateLinkCode.useMutation();
  const deleteAccount = trpc.user.delete.useMutation({ onSuccess: () => { logout(); navigate('/login'); } });
  const updateUser = trpc.user.update.useMutation({ onSuccess: () => {
    utils.user.me.invalidate();
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1500);
    setEditingName(false);
  } });
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const push = usePushNotifications();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Skills/Needs
  const { data: categories } = trpc.skills.categories.useQuery();
  const { data: mySkills } = trpc.skills.mine.useQuery();
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedNeeds, setSelectedNeeds] = useState<Set<string>>(new Set());
  const [skillsInitialized, setSkillsInitialized] = useState(false);
  const saveSkillsMut = trpc.skills.saveSkills.useMutation({ onSuccess: () => utils.skills.mine.invalidate() });
  const saveNeedsMut = trpc.skills.saveNeeds.useMutation({ onSuccess: () => utils.skills.mine.invalidate() });
  const markCompleted = trpc.skills.markCompleted.useMutation({ onSuccess: () => utils.skills.mine.invalidate() });

  useEffect(() => {
    if (mySkills && !skillsInitialized) {
      setSelectedSkills(new Set(mySkills.skills.map((s) => s.categoryId)));
      setSelectedNeeds(new Set(mySkills.needs.map((n) => n.categoryId)));
      setSkillsInitialized(true);
    }
  }, [mySkills, skillsInitialized]);

  const skillsDebounce = useRef<ReturnType<typeof setTimeout>>();
  const autosaveSkills = (nextSkills: Set<string>, nextNeeds: Set<string>) => {
    if (skillsDebounce.current) clearTimeout(skillsDebounce.current);
    skillsDebounce.current = setTimeout(() => {
      saveSkillsMut.mutate({ skills: [...nextSkills].map((cId) => ({ categoryId: cId })) });
      saveNeedsMut.mutate({ needs: [...nextNeeds].map((cId) => ({ categoryId: cId })) });
      if (!mySkills?.skillsCompleted) markCompleted.mutate();
    }, 800);
  };
  const handleToggleSkill = (id: string) => {
    const next = new Set(selectedSkills);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSkills(next);
    autosaveSkills(next, selectedNeeds);
  };
  const handleToggleNeed = (id: string) => {
    const next = new Set(selectedNeeds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedNeeds(next);
    autosaveSkills(selectedSkills, next);
  };

  const handleLanguageChange = (lang: string) => { i18n.changeLanguage(lang); localStorage.setItem('language', lang); updateLanguage.mutate({ language: lang }); };
  const handleThemeChange = (theme: 'LIGHT' | 'DARK' | 'SYSTEM') => { setMode(theme.toLowerCase() as 'light' | 'dark' | 'system'); updateTheme.mutate({ theme }); };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      updateUser.mutate({ photoUrl: dataUrl });
    };
    img.src = URL.createObjectURL(file);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <Settings className="w-5 h-5" /> {t('settings.title')}
      </h1>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar src={me?.photoUrl} name={me?.name || ''} size="lg" />
              <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-500 transition-colors">
                <Camera className="w-3.5 h-3.5 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="relative">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => { if (editName.trim() && editName !== me?.name) updateUser.mutate({ name: editName }); else setEditingName(false); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && editName.trim()) updateUser.mutate({ name: editName }); if (e.key === 'Escape') setEditingName(false); }}
                    className="w-full px-2 py-1 text-lg font-bold rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{me?.name}</h2>
                  {nameSaved && <Check className="w-4 h-4 text-green-500 animate-in fade-in" />}
                  <button
                    onClick={() => { setEditName(me?.name || ''); setEditingName(true); }}
                    className="text-gray-400 hover:text-gray-300"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
              {me?.email && <p className="text-sm text-gray-500 dark:text-gray-300 truncate">{me.email}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500 dark:text-gray-300" />
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('settings.contacts')}</h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">{t('settings.contactsDesc')}</p>
          <div className="flex items-center gap-2 mt-2">
            <EyeOff className="w-4 h-4 text-gray-500 dark:text-gray-300 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.hideContacts')}</span>
            <Tooltip content={t('settings.hideContactsHint')} side="bottom">
              <button type="button" className="text-gray-400 hover:text-gray-500 dark:text-gray-300"><HelpCircle className="w-3.5 h-3.5" /></button>
            </Tooltip>
            <button onClick={() => updateHideContacts.mutate({ hideContacts: !settings?.hideContacts })} className={cn('w-11 h-6 rounded-full transition-colors relative shrink-0 ml-auto', settings?.hideContacts ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')}>
              <div className={cn('w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all', settings?.hideContacts ? 'left-5' : 'left-0.5')} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {contacts?.map((contact) => {
            const isTelegram = contact.type === 'telegram';
            const currentVal = contactValues[contact.type];
            const displayVal = currentVal ?? contact.value;
            const validationError = displayVal.trim() ? validateContact(contact.type, displayVal) : null;
            return (
              <div key={contact.type} className="relative">
                <SocialIcon type={contact.icon} className={`w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isTelegram ? 'text-blue-500' : 'text-gray-500 dark:text-gray-300'}`} />
                <Input
                  id={`contact-${contact.type}`}
                  placeholder={contact.placeholder}
                  value={displayVal}
                  onChange={(e) => {
                    if (isTelegram) return;
                    const val = e.target.value;
                    setContactValues(prev => ({ ...prev, [contact.type]: val }));
                    autosaveContact(contact.type, val);
                  }}
                  className={`w-full pl-10 ${savedTypes[contact.type] ? 'pr-10' : ''} ${isTelegram ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800/50' : ''}`}
                  disabled={isTelegram}
                  error={validationError ? ' ' : undefined}
                />
                {savedTypes[contact.type] && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                    <Check className="w-5 h-5" />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Skills & Needs */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-gray-500 dark:text-gray-300" />
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('skills.title')}</h2>
          </div>
        </CardHeader>
        <CardContent>
          {categories && (
            <SkillSelector
              categories={categories}
              selectedSkills={selectedSkills}
              selectedNeeds={selectedNeeds}
              onToggleSkill={handleToggleSkill}
              onToggleNeed={handleToggleNeed}
            />
          )}
        </CardContent>
      </Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-gray-500 dark:text-gray-300 shrink-0" />
          <Select id="language" label={t('settings.language')} value={i18n.language?.slice(0, 2) || 'en'} onChange={(e) => handleLanguageChange(e.target.value)} options={Object.entries(languageNames).map(([code, name]) => ({ value: code, label: name }))} />
          <Mic className="w-5 h-5 text-gray-500 dark:text-gray-300 shrink-0 ml-2" />
          <Select id="voice-gender" label={t('settings.voiceGender')} value={settings?.voiceGender || 'FEMALE'} onChange={(e) => updateVoiceGender.mutate({ voiceGender: e.target.value as 'FEMALE' | 'MALE' })} options={[{ value: 'FEMALE', label: t('settings.voiceFemale') }, { value: 'MALE', label: t('settings.voiceMale') }]} />
        </div>
      </CardContent></Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3 mb-2"><Palette className="w-5 h-5 text-gray-500 dark:text-gray-300" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.theme')}</span></div>
        <div className="grid grid-cols-3 gap-2">
          {(['LIGHT', 'DARK', 'SYSTEM'] as const).map((th) => (
            <button key={th} onClick={() => handleThemeChange(th)} className={cn('py-2 rounded-lg text-sm font-medium border transition-colors', mode === th.toLowerCase() ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300')}>
              {th === 'LIGHT' ? t('settings.light') : th === 'DARK' ? t('settings.dark') : t('settings.system')}
            </button>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="py-3"><div className="flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Volume2 className="w-4 h-4 text-gray-500 dark:text-gray-300 shrink-0" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{t('settings.sound')}</span>
          <button onClick={() => updateSound.mutate({ soundEnabled: !settings?.soundEnabled })} className={cn('w-11 h-6 rounded-full transition-colors relative shrink-0', settings?.soundEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')}>
            <div className={cn('w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all', settings?.soundEnabled ? 'left-5' : 'left-0.5')} />
          </button>
        </div>
        {push.isSupported && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Bell className="w-4 h-4 text-gray-500 dark:text-gray-300 shrink-0" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{t('settings.push')}</span>
            <button onClick={() => push.isSubscribed ? push.unsubscribe() : push.subscribe()} disabled={push.loading} className={cn('w-11 h-6 rounded-full transition-colors relative shrink-0', push.isSubscribed ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600')}>
              <div className={cn('w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-all', push.isSubscribed ? 'left-5' : 'left-0.5')} />
            </button>
          </div>
        )}
      </div></CardContent></Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3 mb-2"><Type className="w-5 h-5 text-gray-500 dark:text-gray-300" /><span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.fontSize')}</span></div>
        <div className="grid grid-cols-2 gap-2">
          {([{ value: 1.0, label: 'settings.fontStandard' }, { value: 1.25, label: 'settings.fontLarge' }] as const).map((opt) => (
            <button key={opt.value} onClick={() => { updateFontScale.mutate({ fontScale: opt.value }); document.documentElement.style.fontSize = `${opt.value * 100}%`; }} className={cn('py-2 rounded-lg text-sm font-medium border transition-colors', (settings?.fontScale ?? 1.0) === opt.value ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-600' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300')}>
              {t(opt.label)}
            </button>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="py-3">
        <div className="flex items-center gap-3 mb-2">
          <Link className="w-5 h-5 text-gray-500 dark:text-gray-300" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('settings.linkAccount')}</span>
          <Tooltip content={t('settings.linkAccountHint')} side="bottom">
            <button type="button" className="text-gray-400 hover:text-gray-500 dark:text-gray-300"><HelpCircle className="w-3.5 h-3.5" /></button>
          </Tooltip>
        </div>
        {generateCode.data ? (
          <div className="text-center py-2"><p className="text-3xl font-mono font-bold text-blue-600 tracking-widest">{generateCode.data.code}</p><p className="text-xs text-gray-500 dark:text-gray-300 mt-1">{t('settings.codeExpires')}</p></div>
        ) : <Button variant="outline" size="sm" onClick={() => generateCode.mutate()} className="w-full">{t('settings.generateCode')}</Button>}
      </CardContent></Card>


      <Button variant="outline" className="w-full" onClick={() => { logout(); navigate('/login'); }}><LogOut className="w-4 h-4 mr-2" /> {t('settings.logout')}</Button>

      <div className="pt-4">
        {!confirmDelete ? (
          <Button variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}><Trash2 className="w-4 h-4 mr-2" /> {t('settings.deleteAccount')}</Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-500 text-center">{t('settings.deleteConfirm')}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button>
              <Button variant="danger" className="flex-1" onClick={() => deleteAccount.mutate()}>{t('settings.confirmDelete')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
