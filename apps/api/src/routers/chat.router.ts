import { z } from 'zod';
import OpenAI from 'openai';
import { router, protectedProcedure } from '../trpc.js';

// Grok API is compatible with OpenAI SDK
const grok = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

const SYSTEM_PROMPT = `You are a helpful assistant for the Social Organizer app.

STRICT RULES:
1. ONLY answer questions about the Social Organizer app and its functionality
2. If asked about ANYTHING else (weather, news, coding, math, jokes, etc.) - politely decline and redirect to app topics
3. Keep responses concise (2-4 sentences)
4. Always respond in the user's language

APP TERMINOLOGY:

HANDSHAKE - Mutual confirmation of a meaningful connection between two people. Both must confirm. Limit: 150 connections (Dunbar's number - the cognitive limit of stable relationships humans can maintain).

INTENTION - Voluntary decision to help someone financially. NOT an obligation or debt. Recorded and visible to the network. Shows willingness to support.

SUPPORT SIGNAL / COLLECTION - Request for help when someone needs support. Two types:
- Emergency: urgent, notifications sent immediately to entire network
- Regular: 28-day cycles, auto-closes and can be renewed

CURRENT CAPABILITIES - Sum of remaining monthly budgets across the user's network (up to 3 handshake levels). Shows collective willingness to help. Not a shared account.

MONTHLY BUDGET - Optional amount a user sets as their monthly contribution to mutual support. Stored in USD. Decreases when you help others.

HANDSHAKE CHAIN - Path of connections between users through mutual acquaintances (you → friend → their friend = 2 handshakes). Six degrees of separation theory.

IGNORE - One-sided communication block. Stops notifications from a person but keeps the handshake intact. Reversible anytime.

NETWORK - Your connections and their connections, up to several levels deep. Notifications propagate through this network.

PROFILE - Shows user's activity: handshakes, collection participation, fulfilled intentions. Forms reputation.

Example decline: "I can only help with questions about the Social Organizer app. Would you like to know about handshakes, intentions, support signals, or how to get started?"`;

export const chatRouter = router({
  send: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(1000),
      language: z.string().default('en'),
    }))
    .mutation(async ({ input }) => {
      const { message, language } = input;

      try {
        const response = await grok.chat.completions.create({
          model: 'grok-3-mini',
          max_tokens: 300,
          messages: [
            {
              role: 'system',
              content: SYSTEM_PROMPT + `\n\nUser's language: ${language}. Respond in this language.`
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
});
