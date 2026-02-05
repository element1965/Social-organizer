import type { Job } from 'bullmq';
import { sendTelegramMessage, type TgReplyMarkup } from '../services/telegram-bot.service.js';

export interface TgBroadcastMessage {
  telegramId: string;
  text: string;
  replyMarkup?: TgReplyMarkup;
}

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1050; // slightly above 1s to stay under 30 msg/sec limit

/**
 * BullMQ worker: sends Telegram messages in batches of 25 with 1s pause.
 * Handles 429 rate limiting via sendTelegramMessage internal retry.
 */
export async function processTgBroadcast(job: Job<{ messages: TgBroadcastMessage[] }>): Promise<void> {
  const { messages } = job.data;
  if (!messages || messages.length === 0) return;

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map((msg) => sendTelegramMessage(msg.telegramId, msg.text, msg.replyMarkup)),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) sent++;
      else failed++;
    }

    // Pause between batches (skip after last batch)
    if (i + BATCH_SIZE < messages.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  console.log(`[TG Broadcast] Job ${job.id}: sent=${sent}, failed=${failed}, total=${messages.length}`);
}
