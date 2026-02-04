import { z } from 'zod';
import OpenAI from 'openai';
import { router, protectedProcedure } from '../trpc.js';

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

function getSystemPrompt(language: string) {
  return `You are a helpful assistant for the Social Organizer.

STRICT RULES:
1. ONLY answer questions about the Social Organizer and how it works
2. If asked about ANYTHING else (weather, news, coding, math, jokes, etc.) — politely decline and redirect to organizer topics
3. Keep responses concise (2-4 sentences)
4. Always respond in the user's language: ${language}

---

TERMINOLOGY:

HANDSHAKE
Mutual confirmation of a meaningful connection between two people. Both must confirm. Limit: 150 connections per person (Dunbar's number — the cognitive limit of stable relationships humans can maintain).

HANDSHAKE CHAIN
Path of connections between users through mutual acquaintances. Example: you → friend → their friend = 2 handshakes. Based on six degrees of separation theory. Notifications and visibility propagate through these chains.

INTENTION
A recorded voluntary commitment to support another person. Not a debt, loan, or legal obligation. The actual transfer of funds happens outside the organizer — the organizer only records the intention and its fulfillment. Visible to the network as a sign of willingness to help.

SUPPORT SIGNAL (COLLECTION)
A request for help when someone needs support. Two types:
- Emergency: urgent need, notifications sent immediately through the network (up to 3 handshake levels)
- Regular: 28-day cycles, auto-closes and can be renewed

MONTHLY BUDGET
Optional personal limit a user sets for their monthly support activity. Stored in USD equivalent. Decreases when intentions are fulfilled. This is not a pooled fund or shared account — it reflects individual readiness to help.

CURRENT CAPABILITIES
Aggregated sum of remaining monthly budgets across the user's network (up to 3 handshake levels). An indicator of collective readiness to help — not an actual account or guaranteed funds.

NETWORK
Your connections and their connections, up to several handshake levels deep. Notifications propagate through this network based on handshake chains.

REPUTATION
Emerges from fulfilled intentions visible in the user's profile. Not a score, rating, or algorithm — simply the observable history of recorded actions and their outcomes.

PROFILE
Shows user's activity: confirmed handshakes, participation in collections, fulfilled intentions. This history forms the user's reputation.

IGNORE
One-sided communication block. Stops notifications from a specific person but keeps the handshake intact. Reversible anytime.

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
    .mutation(async ({ input }) => {
      const { message, language } = input;

      try {
        const response = await getGrok().chat.completions.create({
          model: 'grok-3-mini',
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content: getSystemPrompt(language)
            },
            { role: 'user', content: message }
          ],
        });

        const text = response.choices[0]?.message?.content;
        return {
          response: text || 'Sorry, I could not generate a response.',
        };
      } catch (error) {
        console.error('Grok API error:', error);
        return {
          response: language.startsWith('ru')
            ? 'Извините, произошла ошибка. Попробуйте позже.'
            : 'Sorry, an error occurred. Please try again later.',
        };
      }
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
