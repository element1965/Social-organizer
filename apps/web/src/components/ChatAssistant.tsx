import { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';
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

  // Quick topic buttons based on language
  const quickTopicsRu = ['рукопожатие', 'намерение', 'возможности', 'как начать'];
  const quickTopicsEn = ['handshake', 'intention', 'capabilities', 'how to start'];
  const quickTopics = i18n.language.startsWith('ru') ? quickTopicsRu : quickTopicsEn;

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

  return (
    <div
      className="flex h-[calc(100dvh-var(--sa-top)-7rem)] flex-col overflow-hidden rounded-lg bg-white dark:bg-gray-900"
      style={viewport ? { height: Math.max(240, viewport.height - 112) } : undefined}
      role="region"
      aria-labelledby="chat-assistant-title"
    >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
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

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  {t('chat.welcomeMessage')}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickTopics.map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSendMessage(term, false)}
                      className="min-h-[44px] px-4 py-2 text-sm rounded-full border transition-colors bg-gray-100 text-gray-800 border-gray-500 hover:bg-gray-200 active:bg-gray-300 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 focus-visible:ring-offset-white dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-600 disabled:border-gray-400 dark:disabled:bg-gray-800 dark:disabled:text-gray-300 dark:disabled:border-gray-500"
                      disabled={isLoading}
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] p-3 rounded-2xl text-sm whitespace-pre-wrap break-words",
                  msg.role === 'user'
                    ? "ml-auto bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md"
                )}
              >
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300" role="status">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Send error: the text is back in the field, retry sends it once */}
          {sendError && (
            <div role="alert" className="flex items-center justify-between gap-2 px-4 py-2 text-sm bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200 border-t border-red-200 dark:border-red-800">
              <span className="min-w-0">{t('chat.sendError')}</span>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className="min-h-[44px] shrink-0 px-3 font-medium underline rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 dark:focus-visible:ring-red-300"
              >
                {t('common.retry')}
              </button>
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 flex items-end gap-2">
            <button
              onClick={toggleListening}
              disabled={isLoading}
              className={cn(
                "w-11 h-11 rounded-full shrink-0 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:focus-visible:ring-blue-400",
                isListening
                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 animate-pulse"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              aria-label={isListening ? t('chat.stopListening') : t('chat.startListening')}
              aria-pressed={isListening}
            >
              {isListening ? <MicOff className="w-5 h-5" aria-hidden="true" /> : <Mic className="w-5 h-5" aria-hidden="true" />}
            </button>
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
              className="flex-1 min-w-0 min-h-[44px] max-h-32 resize-none overflow-y-auto break-words rounded-2xl border border-gray-500 dark:border-gray-400 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm leading-5 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-blue-400 focus:border-transparent"
              disabled={isListening || isLoading}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isListening || isLoading}
              aria-label={t('chat.send')}
              className={cn(
                "w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-600 focus-visible:ring-offset-white dark:focus-visible:ring-blue-400 dark:focus-visible:ring-offset-gray-900",
                (!input.trim() || isListening || isLoading)
                  ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 cursor-not-allowed"
                  : "bg-blue-700 text-white hover:bg-blue-800"
              )}
            >
              <Send className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
    </div>
  );
}
