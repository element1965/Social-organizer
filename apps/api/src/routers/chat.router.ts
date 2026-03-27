import { z } from 'zod';
import OpenAI from 'openai';
import { router, protectedProcedure } from '../trpc.js';
import { getDb } from '@so/db';
import { SCREEN_GUIDE } from '../knowledge/screens.js';
import { translateText } from '../services/translate.service.js';

// Grok API is compatible with OpenAI SDK — lazy init to avoid crash if key is missing at startup
let grok: OpenAI | null = null;
function getGrok(): OpenAI {
  if (!grok) {
    grok = new OpenAI({
      apiKey: process.env.XAI_API_KEY || 'missing',
      baseURL: 'https://api.x.ai/v1',
    });
  }
  return grok;
}

// OpenAI TTS client — lazy init
let openaiTts: OpenAI | null = null;
function getOpenAITts(): OpenAI {
  if (!openaiTts) {
    openaiTts = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'missing',
    });
  }
  return openaiTts;
}

// Keyword-based server-side feedback detection (fallback when LLM misses [FEEDBACK] tag)
const FEEDBACK_PATTERNS_RU = [
  /будет\s+ли\b/i, /добавь/i, /добавить/i, /хочу\s+чтобы/i, /хотелось\s+бы/i,
  /было\s+бы\s+круто/i, /было\s+бы\s+здорово/i, /можно\s+ли\s+сделать/i,
  /предлагаю/i, /предложение/i, /пожелание/i, /не\s+хватает/i,
  /сделайте/i, /сделай/i, /нужна?\s+функци/i, /а\s+будет\b/i,
  /почему\s+нет/i, /когда\s+будет/i, /планируете/i, /будете\s+делать/i,
];
const FEEDBACK_PATTERNS_EN = [
  /will\s+there\s+be/i, /can\s+you\s+add/i, /please\s+add/i, /i\s+want/i,
  /i\s+wish/i, /it\s+would\s+be\s+(nice|great|cool)/i, /feature\s+request/i,
  /suggestion/i, /feedback/i, /missing\s+feature/i, /you\s+should\s+add/i,
  /would\s+be\s+nice/i, /how\s+about\s+adding/i, /do\s+you\s+plan/i,
];

function detectFeedbackByKeywords(message: string): boolean {
  const patterns = [...FEEDBACK_PATTERNS_RU, ...FEEDBACK_PATTERNS_EN];
  return patterns.some((p) => p.test(message));
}

/** Send user feedback to Telegram group (fire-and-forget) */
async function sendFeedbackToTelegram(userMessage: string, userId: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.FEEDBACK_CHAT_ID;
  if (!botToken || !chatId) return;

  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, phone: true, contacts: { select: { type: true, value: true } } },
  });

  const userName = user?.name || 'Unknown';
  const contactLines: string[] = [];
  if (user?.email) contactLines.push(`Email: ${user.email}`);
  if (user?.phone) contactLines.push(`Phone: ${user.phone}`);
  if (user?.contacts) {
    for (const c of user.contacts) {
      contactLines.push(`${c.type}: ${c.value}`);
    }
  }
  const contactsStr = contactLines.length > 0 ? `\n${contactLines.join('\n')}` : '';

  const text = `💬 <b>Feedback</b>\n\nFrom: <b>${userName}</b>${contactsStr}\n\n${userMessage}`;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

async function getSystemPrompt(language: string): Promise<string> {
  const db = getDb();
  // Normalize to 2-char language code so 'ru-RU' → 'ru', 'en-US' → 'en', etc.
  const lang2 = language.slice(0, 2).toLowerCase();
  // Load FAQ from DB in user's language
  let faqItems = await db.faqItem.findMany({
    where: { language: lang2 },
    orderBy: { viewCount: 'desc' },
  });
  // If no FAQ in user's language, load Russian and translate
  if (faqItems.length === 0 && lang2 !== 'ru') {
    const ruItems = await db.faqItem.findMany({
      where: { language: 'ru' },
      orderBy: { viewCount: 'desc' },
    });
    if (ruItems.length > 0) {
      const ruBlock = ruItems.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n');
      try {
        const translated = await translateText(ruBlock, 'ru', lang2);
        return buildPrompt(language, 'FREQUENTLY ASKED QUESTIONS:\n\n' + translated);
      } catch {
        // If translation fails, use Russian as-is
        faqItems = ruItems;
      }
    }
  }

  const faqBlock = faqItems.length > 0
    ? 'FREQUENTLY ASKED QUESTIONS:\n\n' + faqItems.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
    : '';
  return buildPrompt(language, faqBlock);
}

function buildPrompt(language: string, faqBlock: string): string {

  return `You are a helpful assistant for the Social Organizer.

CRITICAL CONTEXT: The user is ALREADY registered and logged in. They are using the app right now. NEVER tell them to register, sign up, go to the landing page, or log in — they have already done all of that. When they ask "how to start" or "how to get started", guide them through the app features they can use RIGHT NOW: Dashboard, Network, creating collections (SOS), setting a budget, inviting friends via QR code or link.

STRICT RULES:
1. ONLY answer questions about the Social Organizer and how it works
2. If asked about ANYTHING else that is COMPLETELY unrelated to the app (weather, news, coding, math, jokes, etc.) — politely decline and redirect to organizer topics
3. Be concise but complete. For simple questions: 1-3 sentences. For "how to use", "how to start", "what can I do" questions: provide a helpful step-by-step overview (up to 8-10 sentences). Never truncate useful information.
4. Always respond in the user's language: ${language}
5. IMPORTANT (takes priority over rule #2): If the user asks about a feature that does NOT exist in the app, asks "will there be X?", requests a new feature, or gives any suggestion/wish/feedback about the app — this is FEEDBACK. Start your response EXACTLY with [FEEDBACK] tag (this tag will be removed before showing to user). Then respond warmly, thank them, and say their suggestion has been forwarded to the team. Examples of feedback: "add dark theme by default", "will there be IP telephony?", "I want push notifications", "make the font bigger", "add crowdfunding".

---

${SCREEN_GUIDE}

---

${faqBlock}

---

IMPORTANT PRINCIPLES:
- The organizer does not handle money — it only records intentions and confirmations
- All actual transfers happen outside, through any method participants choose
- Trust verification is architecturally unnecessary — the structure makes harmful actions irrelevant
- Reputation is not assigned — it emerges from visible actions

---

Example decline response:
"I can only help with questions about the Social Organizer. Would you like to know about handshakes, intentions, support signals, or how to get started?"

User's language: ${language}. Respond in this language.`;
}

export const chatRouter = router({
  send: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(1000),
      language: z.string().default('en'),
    }))
    .mutation(async ({ ctx, input }) => {
      const { message, language } = input;

      const systemPrompt = await getSystemPrompt(language);
      const chatMessages: { role: 'system' | 'user'; content: string }[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      let responseText: string | null = null;

      // Try Grok first, fall back to OpenAI if it fails (e.g. no credits)
      try {
        const response = await getGrok().chat.completions.create({
          model: 'grok-3-mini',
          max_tokens: 600,
          messages: chatMessages,
        });
        responseText = response.choices[0]?.message?.content || null;
      } catch (error) {
        console.error('Grok API error, falling back to OpenAI:', error);
      }

      if (!responseText) {
        try {
          const response = await getOpenAITts().chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 600,
            messages: chatMessages,
          });
          responseText = response.choices[0]?.message?.content || null;
        } catch (error) {
          console.error('OpenAI fallback error:', error);
          return {
            response: language.startsWith('ru')
              ? 'Извините, произошла ошибка. Попробуйте позже.'
              : 'Sorry, an error occurred. Please try again later.',
          };
        }
      }

      if (!responseText) {
        return { response: 'Sorry, I could not generate a response.' };
      }

      // Detect feedback: LLM tag OR server-side keyword matching
      let isFeedback = false;
      if (responseText.startsWith('[FEEDBACK]')) {
        responseText = responseText.slice('[FEEDBACK]'.length).trimStart();
        isFeedback = true;
      } else if (detectFeedbackByKeywords(message)) {
        isFeedback = true;
      }

      if (isFeedback) {
        sendFeedbackToTelegram(message, ctx.userId!).catch((err) =>
          console.error('Failed to send feedback to TG:', err),
        );
        // Save to in-app support chat so admins can respond
        ctx.db.supportMessage.create({
          data: { userId: ctx.userId!, message, fromAdmin: false },
        }).catch((err) => console.error('Failed to save feedback to support:', err));
      }

      // Save conversation to DB (fire-and-forget)
      ctx.db.chatMessage.create({
        data: {
          userId: ctx.userId!,
          userMessage: message,
          assistantMessage: responseText,
          isFeedback,
          language,
        },
      }).catch((err) => console.error('Failed to save chat message:', err));

      return { response: responseText };
    }),

  speak: protectedProcedure
    .input(z.object({
      text: z.string().max(500),
      voice: z.enum(['nova', 'onyx']).default('nova'),
    }))
    .mutation(async ({ input }) => {
      try {
        const response = await getOpenAITts().audio.speech.create({
          model: 'tts-1',
          voice: input.voice,
          input: input.text,
          response_format: 'mp3',
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        return { audio: buffer.toString('base64') };
      } catch (error) {
        console.error('OpenAI TTS error:', error);
        throw new Error('TTS generation failed');
      }
    }),
});
