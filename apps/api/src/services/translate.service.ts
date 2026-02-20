import OpenAI from 'openai';
import { createHash } from 'crypto';
import { getDb } from '@so/db';

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

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'missing',
    });
  }
  return openai;
}

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const messages: { role: 'system' | 'user'; content: string }[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const res = await getGrok().chat.completions.create({
      model: 'grok-3-mini',
      max_tokens: 2000,
      messages,
    });
    const text = res.choices[0]?.message?.content;
    if (text) return text.trim();
  } catch (err) {
    console.error('[Translate] Grok failed, falling back to OpenAI:', err);
  }

  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 2000,
    messages,
  });
  return res.choices[0]?.message?.content?.trim() || '';
}

export async function translateText(text: string, fromLang: string, toLang: string): Promise<string> {
  const systemPrompt = `You are a professional translator. Translate from ${fromLang} to ${toLang}. Only return the translation, nothing else.`;
  return callLLM(systemPrompt, text);
}

export async function translateFaqItem(
  question: string,
  answer: string,
  fromLang: string,
  toLang: string,
): Promise<{ question: string; answer: string }> {
  const systemPrompt = `You are a professional translator. Translate from ${fromLang} to ${toLang}. Return ONLY a JSON object with "question" and "answer" fields. No markdown, no explanation.`;
  const userPrompt = JSON.stringify({ question, answer });

  const result = await callLLM(systemPrompt, userPrompt);
  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Fallback: translate separately
    const q = await translateText(question, fromLang, toLang);
    const a = await translateText(answer, fromLang, toLang);
    return { question: q, answer: a };
  }
}

export async function translateBroadcastMessage(text: string, toLang: string): Promise<string> {
  const systemPrompt = `You are a professional translator. Translate the following message to ${toLang}. Only return the translation, nothing else. Preserve any HTML tags.`;
  return callLLM(systemPrompt, text);
}

/**
 * Translate with persistent DB cache.
 * Checks translation_cache table first; only calls LLM on cache miss.
 * Returns original text for Russian (base language).
 */
export async function translateWithCache(text: string, toLang: string): Promise<string> {
  if (toLang === 'ru') return text;

  const sourceHash = createHash('md5').update(text).digest('hex');
  const db = getDb();

  // Check DB cache
  const cached = await db.translationCache.findUnique({
    where: { sourceHash_language: { sourceHash, language: toLang } },
  });
  if (cached) return cached.translated;

  // Cache miss — call LLM
  const translated = await translateBroadcastMessage(text, toLang);

  // Persist to DB (fire-and-forget upsert to avoid race conditions)
  await db.translationCache.upsert({
    where: { sourceHash_language: { sourceHash, language: toLang } },
    create: { sourceHash, language: toLang, translated },
    update: { translated },
  }).catch((err) => {
    console.error('[TranslationCache] Failed to save:', err);
  });

  return translated;
}
