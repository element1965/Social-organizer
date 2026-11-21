/**
 * Which Web Push endpoints the server will POST to (SEC-3). A subscription's endpoint comes from the
 * browser, but the API only sees what the client sends, so it is checked against the push services that
 * browsers actually hand out, both when it is saved and again right before every delivery:
 * - Chrome, Chromium-based browsers (Opera, Samsung Internet, Brave): fcm.googleapis.com
 * - Firefox: updates.push.services.mozilla.com (and other *.push.services.mozilla.com hosts)
 * - Safari (macOS 13+, iOS 16.4+): web.push.apple.com (*.push.apple.com)
 * - Edge: *.notify.windows.com (WNS)
 * Only https on the default port, no credentials in the URL.
 */
const PUSH_HOSTS: Array<(host: string) => boolean> = [
  (h) => h === 'fcm.googleapis.com',
  (h) => h === 'push.services.mozilla.com' || h.endsWith('.push.services.mozilla.com'),
  (h) => h.endsWith('.push.apple.com'),
  (h) => h.endsWith('.notify.windows.com'),
];

export const MAX_PUSH_ENDPOINT_LENGTH = 2048;

/** Browsers per account that receive Web Push; registering one more drops the oldest (SEC-3). */
export const MAX_PUSH_SUBSCRIPTIONS = 10;

export function isAllowedPushEndpoint(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > MAX_PUSH_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
  const host = url.hostname;
  // Hostnames only: an IP literal (v4 or [v6]) or a trailing-dot name never matches a push service
  if (!/^[a-z0-9.-]+$/.test(host) || host.endsWith('.')) return false;
  return PUSH_HOSTS.some((match) => match(host));
}
