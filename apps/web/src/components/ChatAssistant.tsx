import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Mic, MicOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { getLocalResponse } from '../lib/chatResponses';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  viaVoice?: boolean;
}

export function ChatAssistant() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak message using Web Speech API
  const speakMessage = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = i18n.language === 'ru' || i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US';
      utterance.rate = 0.9;
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
      recognitionRef.current.lang = i18n.language === 'ru' || i18n.language.startsWith('ru') ? 'ru-RU' : 'en-US';
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
  const handleSendMessage = (text: string, viaVoice: boolean = false) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      viaVoice,
    };

    const response = getLocalResponse(text, i18n.language);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      viaVoice,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');

    // If user used voice, respond with voice
    if (viaVoice) {
      setTimeout(() => speakMessage(response), 300);
    }
  };

  // Handle text input submit
  const handleSubmit = () => {
    handleSendMessage(input, false);
  };

  // Quick topic buttons for Russian language
  const quickTopicsRu = ['рукопожатие', 'намерение', 'возможности', 'как начать'];
  const quickTopicsEn = ['handshake', 'intention', 'capabilities', 'how to start'];
  const quickTopics = i18n.language.startsWith('ru') ? quickTopicsRu : quickTopicsEn;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-20 right-4 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg",
          "flex items-center justify-center hover:bg-blue-700 transition-all z-40",
          "hover:scale-105 active:scale-95",
          isOpen && "hidden"
        )}
        aria-label={t('chat.openChat')}
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed inset-x-4 bottom-20 max-h-[60vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 flex flex-col border border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-600" />
              {t('chat.title')}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
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
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex gap-2">
            <button
              onClick={toggleListening}
              className={cn(
                "p-2 rounded-full shrink-0 transition-colors",
                isListening
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 animate-pulse"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
              aria-label={isListening ? t('chat.stopListening') : t('chat.startListening')}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
              placeholder={t('chat.placeholder')}
              className="flex-1"
              disabled={isListening}
            />
            <Button
              onClick={handleSubmit}
              disabled={!input.trim() || isListening}
              size="sm"
              className="shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
