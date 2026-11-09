import { appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Outgoing e-mail (SO-21 sign-in codes).
 *
 * Production sends through Resend (RESEND_API_KEY + MAIL_FROM).
 * Without a key, a non-production server writes messages to a local outbox file
 * (DEV_MAIL_OUTBOX, default <tmp>/so-dev-mail.log) so codes can be read during local tests.
 * Message bodies are never written to the server log, except on a test server
 * (staging) that sets MAIL_LOG_TO_STDOUT=1 and has no Resend key: there the
 * container's files are unreachable, so messages go to stdout instead.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || 'Social Organizer <no-reply@mail.orginizer.com>';
const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_OUTBOX = process.env.DEV_MAIL_OUTBOX || join(tmpdir(), 'so-dev-mail.log');
const LOG_TO_STDOUT = process.env.MAIL_LOG_TO_STDOUT === '1';

export function isMailConfigured(): boolean {
  return !!RESEND_API_KEY || !IS_PROD || LOG_TO_STDOUT;
}

export class MailUnavailableError extends Error {
  constructor() {
    super('EMAIL_UNAVAILABLE');
  }
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) {
      // Status only: the response may echo the message
      console.error('[mail] Resend refused the message, status', res.status);
      throw new MailUnavailableError();
    }
    return;
  }
  if (LOG_TO_STDOUT) {
    console.log(`[mail:test-outbox] to=${msg.to} subject=${JSON.stringify(msg.subject)} text=${JSON.stringify(msg.text)}`);
    return;
  }
  if (IS_PROD) throw new MailUnavailableError();
  await appendFile(DEV_OUTBOX, JSON.stringify({ at: new Date().toISOString(), ...msg }) + '\n', 'utf8');
}
