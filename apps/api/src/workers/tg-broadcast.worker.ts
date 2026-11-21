import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { runNeedDelivery, type NeedDelivery } from '../services/need-delivery-state.js';
import { sendTelegramMessage, sendTelegramMessageOutcome, type TgReplyMarkup } from '../services/telegram-bot.service.js';

export interface TgBroadcastMessage {
  telegramId: string;
  text: string;
  replyMarkup?: TgReplyMarkup;
  delivery?: NeedDelivery;
}

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1050; // slightly above 1s to stay under 30 msg/sec limit

/**
 * Pace Telegram broadcasts and acknowledge each durable Need delivery after provider handoff.
 * Durable sends retry through their pending rows, including after a Telegram 429.
 */
export async function processTgBroadcast(job: Job<{ messages: TgBroadcastMessage[] }>): Promise<void> {
  const { messages } = job.data;
  if (!messages || messages.length === 0) return;

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async (msg) => {
        if (!msg.delivery) return await sendTelegramMessage(msg.telegramId, msg.text, msg.replyMarkup) ? 'sent' : 'retry';
        return runNeedDelivery(
          getDb(), msg.delivery, 'TELEGRAM', (beforeHandoff) => sendTelegramMessageOutcome(msg, beforeHandoff),
        );
      }),
    );

    for (const r of results) {
      if (r.status === 'rejected' || r.value === 'retry') failed++;
      else if (r.value === 'sent') sent++;
      else skipped++;
    }

    // Pause after every full batch, the last one of a job too: the next job starts right away, and two
    // batches inside one second would pass Telegram's limit of about 30 messages a second
    if (batch.length === BATCH_SIZE || batch.some(({ delivery }) => delivery)) {
      await new Promise((r) => setTimeout(r, Math.ceil(BATCH_DELAY_MS * batch.length / BATCH_SIZE)));
    }
  }

  console.log(`[TG Broadcast] Job ${job.id}: sent=${sent}, failed=${failed}, skipped=${skipped}, total=${messages.length}`);
}
