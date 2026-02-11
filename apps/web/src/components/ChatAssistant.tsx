import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Mic, MicOff, Loader2, HelpCircle, Megaphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { trpc } from '../lib/trpc';
import { BroadcastPanel } from './BroadcastPanel';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  viaVoice?: boolean;
}

type ViewState = 'collapsed' | 'expanded' | 'chatOpen' | 'broadcastOpen';

export function ChatAssistant() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [viewState, setViewState] = useState<ViewState>('collapsed');

  // Listen for external toggle event (from Layout header button)
  useEffect(() => {
    const handler = () => {
      setViewState((prev) => (prev === 'collapsed' ? 'expanded' : 'collapsed'));
    };
    window.addEventListener('toggle-help-menu', handler);
    return () => window.removeEventListener('toggle-help-menu', handler);
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingVoiceRef = useRef(false);

  const { data: settings } = trpc.settings.get.useQuery();
  const { data: adminData } = trpc.faq.isAdmin.useQuery();
  const isAdmin = adminData?.isAdmin ?? false;
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
      const baseLang = i18n.language.split('-')[0];
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
      const baseLang = i18n.language.split('-')[0];
      const langMap: Record<string, string> = {
        ru: 'ru-RU', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
        pt: 'pt-BR', it: 'it-IT', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR',
        ar: 'ar-SA', hi: 'hi-IN', tr: 'tr-TR', pl: 'pl-PL', uk: 'uk-UA',
      };
      recognitionRef.current.lang = langMap[baseLang] || 'en-US';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
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
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      viaVoice,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
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
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('common.error'),
        viaVoice,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      pendingVoiceRef.current = false;
    }
  };

  // Handle text input submit
  const handleSubmit = () => {
    handleSendMessage(input, false);
  };

  // Quick topic buttons based on language
  const quickTopicsRu = ['рукопожатие', 'намерение', 'возможности', 'как начать'];
  const quickTopicsEn = ['handshake', 'intention', 'capabilities', 'how to start'];
  const quickTopics = i18n.language.startsWith('ru') ? quickTopicsRu : quickTopicsEn;

  const isOpen = viewState === 'chatOpen';

  return (
    <>
      {/* Transparent overlay to close expanded menu */}
      {viewState === 'expanded' && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setViewState('collapsed')}
        />
      )}

      {/* Sub-buttons (Broadcast + FAQ + Chat) — positioned near the top-right help button */}
      {viewState === 'expanded' && (
        <div className="fixed top-14 right-4 z-40 flex flex-col items-end gap-2">
          {/* FAQ button */}
          <button
            onClick={() => {
              setViewState('collapsed');
              navigate('/faq');
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 animate-in fade-in slide-in-from-top-4"
          >
            <HelpCircle className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-medium">FAQ</span>
          </button>
          {/* Chat button */}
          <button
            onClick={() => setViewState('chatOpen')}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 animate-in fade-in slide-in-from-top-4"
            style={{ animationDelay: '50ms' }}
          >
            <MessageCircle className="w-5 h-5 text-blue-500" />
            <span className="text-sm font-medium">{t('chat.title')}</span>
          </button>
          {/* Broadcast button (admin only) */}
          {isAdmin && (
            <button
              onClick={() => setViewState('broadcastOpen')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 animate-in fade-in slide-in-from-top-4"
              style={{ animationDelay: '100ms' }}
            >
              <Megaphone className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-medium">{t('broadcast.title')}</span>
            </button>
          )}
        </div>
      )}

      {/* Main floating button — hidden, replaced by Layout header button */}
      <button
        onClick={() => {
          if (viewState === 'collapsed') setViewState('expanded');
          else if (viewState === 'expanded') setViewState('collapsed');
        }}
        className={cn(
          "fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-lg",
          "flex items-center justify-center transition-all z-40",
          "hover:scale-105 active:scale-95",
          "hidden"
        )}
        aria-label={t('chat.openHelp')}
      >
        {viewState === 'expanded' ? (
          <X className="w-6 h-6" />
        ) : (
          <HelpCircle className="w-6 h-6" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed inset-x-4 top-14 max-h-[60vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              {t('chat.title')}
            </h3>
            <button
              onClick={() => setViewState('collapsed')}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
            {messages.length === 0 && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-3">
                  {t('chat.welcomeMessage')}
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {quickTopics.map((term) => (
                    <button
                      key={term}
                      onClick={() => handleSendMessage(term, false)}
                      className="text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
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
                  "max-w-[85%] p-3 rounded-2xl text-sm",
                  msg.role === 'user'
                    ? "ml-auto bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md"
                )}
              >
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{t('common.loading')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="pl-2 py-2 pr-0 border-t border-gray-200 dark:border-gray-700 flex items-center">
            <button
              onClick={toggleListening}
              disabled={isLoading}
              className={cn(
                "p-2 rounded-full shrink-0 transition-colors mr-1",
                isListening
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 animate-pulse"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
              aria-label={isListening ? t('chat.stopListening') : t('chat.startListening')}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder={t('chat.placeholder')}
              className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isListening || isLoading}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isListening || isLoading}
              className={cn(
                "w-12 h-10 shrink-0 bg-blue-600 text-white transition-colors flex items-center justify-center rounded-r-2xl rounded-l-full",
                (!input.trim() || isListening || isLoading) ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-700"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Broadcast panel */}
      {viewState === 'broadcastOpen' && (
        <BroadcastPanel onClose={() => setViewState('collapsed')} />
      )}
    </>
  );
}
