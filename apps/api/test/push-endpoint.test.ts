import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint } from '../src/services/push-endpoint.js';

describe('Web Push endpoint check', () => {
  it('accepts the endpoints browsers hand out', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91bE',
      'https://fcm.googleapis.com/wp/dQw4w9WgXcQ',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
      'https://web.push.apple.com/QGuQyavXutnMH7qbmbLnFBJ9hgGdeXv',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB',
      'https://fcm.googleapis.com:443/fcm/send/abc',
    ]) expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
  });

  it('refuses anything else the server could be made to contact', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://user:pass@fcm.googleapis.com/fcm/send/abc',
      'https://user@fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/fcm/send/abc',
      'https://evilfcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com./fcm/send/abc',
      'https://push.apple.com.evil.example/x',
      'https://notify.windows.com/x',
      'https://evilpush.services.mozilla.com.example/x',
      'https://169.254.169.254/latest/meta-data',
      'https://127.0.0.1/x',
      'https://[::1]/x',
      'https://postgres.railway.internal/x',
      'https://localhost/x',
      'file:///etc/passwd',
      'not a url',
      '',
      `https://fcm.googleapis.com/fcm/send/${'a'.repeat(3000)}`,
      42,
      null,
    ]) expect(isAllowedPushEndpoint(endpoint), String(endpoint)).toBe(false);
  });
});
