import { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';
import { Button } from './ui2/Button';
import { Chip } from './ui2/Chip';
import { Segmented } from './ui2/Segmented';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  viaVoice?: boolean;
}

export function ChatAssistant() {
  const { t, i18n } = useTranslation();
  const utils = trpc.useUtils();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sendError, setSendError] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingVoiceRef = useRef(false);
  // Synchronous guard: React state updates are async, so a fast double tap could send twice
  const sendingRef = useRef(false);
  // Visible viewport (shrinks when the on-screen keyboard opens on iOS/Android)
  const [viewport, setViewport] = useState<{ height: number; top: number } | null>(null);

  const { data: settings } = trpc.settings.get.useQuery();
  const updateVoice = trpc.settings.updateVoiceGender.useMutation({
    onSuccess: () => { void utils.settings.get.invalidate(); },
  });
  const chatMutation = trpc.chat.send.useMutation();
  const speakMutation = trpc.chat.speak.useMutation();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak message using OpenAI TTS with Web Speech API fallback
  const speakMessage = async (text: string) => {
    const voice = settings?.voiceGender === 'MALE' ? 'onyx' : 'nova';

    try {
      const result = await speakMutation.mutateAsync({ text, voice });
      if (result.audio) {
        const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
        audio.play().catch(() => {});
        return;
      }
    } catch {
      // Fallback to Web Speech API
    }

    // Web Speech API fallback
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const langMap: Record<string, string> = {
        ru: 'ru-RU', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
        pt: 'pt-BR', it: 'it-IT', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
        ar: 'ar-SA', hi: 'hi-IN', tr: 'tr-TR', pl: 'pl-PL', uk: 'uk-UA',
        nl: 'nl-NL', sv: 'sv-SE', da: 'da-DK', fi: 'fi-FI', no: 'nb-NO',
        cs: 'cs-CZ', ro: 'ro-RO', th: 'th-TH', vi: 'vi-VN', id: 'id-ID',
      };
      const baseLang = i18n.language.split('-')[0] || 'en';
      utterance.lang = langMap[baseLang] || 'en-US';
      utterance.rate = 0.9;

      const voices = speechSynthesis.getVoices();
      const preferFemale = settings?.voiceGender !== 'MALE';
      const matchingVoice = voices.find(v =>
        v.lang.startsWith(baseLang) &&
        (preferFemale ? v.name.toLowerCase().includes('female') || !v.name.toLowerCase().includes('male') : v.name.toLowerCase().includes('male'))
      ) || voices.find(v => v.lang.startsWith(baseLang));

      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      speechSynthesis.speak(utterance);
    }
  };

  // Handle voice input toggle
  const toggleListening = () => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      alert(t('chat.speechNotSupported'));
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current = new SpeechRecognitionAPI();
      const baseLang = i18n.language.split('-')[0] || 'en';
      const langMap: Record<string, string> = {
        ru: 'ru-RU', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
        pt: 'pt-BR', it: 'it-IT', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
        ar: 'ar-SA', hi: 'hi-IN', tr: 'tr-TR', pl: 'pl-PL', uk: 'uk-UA',
      };
      recognitionRef.current.lang = langMap[baseLang] || 'en-US';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => {
        const transcript = event.results[0]![0]!.transcript;
        // Directly send the voice message
        handleSendMessage(transcript, true);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Send message (text or voice)
  const handleSendMessage = async (text: string, viaVoice: boolean = false) => {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      viaVoice,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSendError(false);
    setIsLoading(true);
    pendingVoiceRef.current = viaVoice;

    try {
      const result = await chatMutation.mutateAsync({
        message: text.trim(),
        language: i18n.language,
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.response,
        viaVoice,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If user used voice, respond with voice
      if (pendingVoiceRef.current) {
        setTimeout(() => speakMessage(result.response), 300);
      }
    } catch {
      // Drop the unsent message and put its text back, so a retry sends it exactly once
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
      setInput(text.trim());
      setSendError(true);
    } finally {
      setIsLoading(false);
      pendingVoiceRef.current = false;
      sendingRef.current = false;
    }
  };

  // Handle text input submit
  const handleSubmit = () => {
    handleSendMessage(input, false);
  };

  // Grow the textarea with its content (up to max-height, then it scrolls)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const topicValue = t('chat.topics', { returnObjects: true });
  const quickTopics = Array.isArray(topicValue) ? topicValue.filter((item): item is string => typeof item === 'string') : [];

  // Keep the chat panel inside the visible viewport so the keyboard never covers the input row
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport({ height: vv.height, top: vv.offsetTop });
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setViewport(null);
    };
  }, []);

  const canSend = Boolean(input.trim()) && !isListening && !isLoading;

  return (
    <div
      className="flex h-[calc(100dvh-var(--sa-top)-7rem)] flex-col overflow-hidden"
      style={viewport ? { height: Math.max(240, viewport.height - 112) } : undefined}
      role="region"
      aria-labelledby="chat-assistant-title"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line py-2">
        <h3 id="chat-assistant-title" className="sr-only">{t('chat.title')}</h3>
        <span className="text-body-s font-bold text-ink">{t('help.voice')}</span>
        <Segmented
          variant="inline"
          label={t('help.voice')}
          value={settings?.voiceGender === 'MALE' ? 'MALE' : 'FEMALE'}
          onChange={(voiceGender) => updateVoice.mutate({ voiceGender })}
          options={[
            { value: 'FEMALE', label: t('settings.voiceFemale') },
            { value: 'MALE', label: t('settings.voiceMale') },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden py-4">
        {messages.length === 0 && (
          <div className="py-4 text-center">
            <p className="mb-3 text-body-s text-ink-muted">{t('chat.welcomeMessage')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickTopics.map((term) => (
                <Chip key={term} variant="preset" disabled={isLoading} onClick={() => handleSendMessage(term, false)}>
                  {term}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl p-3 text-body-s',
              msg.role === 'user'
                ? 'ml-auto rounded-br-md bg-care text-care-on'
                : 'rounded-bl-md border border-line bg-surface text-ink',
            )}
          >
            {msg.content}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-ink-muted" role="status">
            <span className="so-spin h-4 w-4 rounded-full border-2 border-current/40 border-t-current" aria-hidden />
            <span className="text-body-s">{t('common.loading')}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {sendError && (
        <div role="alert" className="flex items-center justify-between gap-2 border-t border-sos/30 bg-sos-soft px-1 py-1 text-body-s text-sos">
          <span className="min-w-0">{t('chat.sendError')}</span>
          <Button variant="textDanger" onClick={handleSubmit} disabled={!input.trim() || isLoading}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-line py-2">
        <Button
          variant="icon"
          className={cn('h-11 w-11 shrink-0 rounded-lg', isListening && 'border-transparent bg-sos-soft text-sos')}
          onClick={toggleListening}
          disabled={isLoading}
          aria-label={isListening ? t('chat.stopListening') : t('chat.startListening')}
          aria-pressed={isListening}
          icon={isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        />
        <textarea
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter adds a new line (IME composition is left alone)
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t('chat.placeholder')}
          aria-label={t('chat.inputLabel')}
          className="max-h-32 min-h-11 w-full min-w-0 flex-1 resize-none overflow-y-auto break-words rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 so-field text-body-s font-semibold leading-5 text-ink outline-none placeholder:text-ink-subtle focus:border-care disabled:opacity-50"
          disabled={isListening || isLoading}
        />
        <Button
          variant="primary"
          className="h-11 w-11 shrink-0 rounded-lg px-0"
          onClick={handleSubmit}
          disabled={!canSend}
          aria-label={t('chat.send')}
          icon={<Send className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
