const KNOWN = new Set([
  'AUTHOR',
  'NOT_ELIGIBLE',
  'ALREADY',
  'BANNED',
  'UNAVAILABLE',
  'REVIEW_OPEN',
  'ESCALATED',
  'COOLDOWN',
  'TOO_SOON',
  'REVIEW_CLOSED',
  'NOT_AUDIENCE',
  'ALREADY_VOTED',
]);

export function moderationError(error: unknown, translate: (key: string) => string): string {
  const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : '';
  if (KNOWN.has(message)) return translate(`moderation.errors.${message}`);
  return translate('moderation.errors.GENERIC');
}
