import { Capacitor } from '@capacitor/core';
import jsQR from 'jsqr';
import { detectDevice } from './device';

export type ScanTarget =
  | { kind: 'invite'; token: string }
  | { kind: 'sos'; id: string }
  | { kind: 'unknown' };

/** Single path segments that are app routes, not a referral slug. */
const RESERVED = new Set([
  'add',
  'ask',
  'auth',
  'arvut',
  'collection',
  'create',
  'dashboard',
  'delete-account',
  'dev',
  'faq',
  'how',
  'intro',
  'invite',
  'login',
  'matches',
  'me',
  'needs',
  'network',
  'notifications',
  'onboarding',
  'people',
  'person',
  'privacy',
  'profile',
  'seed',
  'settings',
  'skills',
  'sos',
  'support',
  'terms',
  'welcome',
]);

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Turn a scanned string into an invite token or a collection id.
 * Accepts /invite/:token, ?invite=, Telegram start=invite_, /sos/:id, and orginizer.com/<slug>.
 */
export function parseScannedText(raw: string): ScanTarget {
  const text = raw.trim();
  if (!text) return { kind: 'unknown' };

  let url: URL | null = null;
  try {
    url = new URL(text);
  } catch {
    url = null;
  }

  if (url) {
    const parts = url.pathname.split('/').filter(Boolean);
    const head = parts[0];
    const second = parts[1];
    if (head === 'sos' && second) return { kind: 'sos', id: decodePart(second) };

    const inviteAt = parts.indexOf('invite');
    const inviteToken = inviteAt >= 0 ? parts[inviteAt + 1] : undefined;
    if (inviteToken) return { kind: 'invite', token: decodePart(inviteToken) };

    const queryInvite = url.searchParams.get('invite');
    if (queryInvite) return { kind: 'invite', token: queryInvite };

    const start = url.searchParams.get('start') || url.searchParams.get('startapp');
    if (start?.startsWith('invite_') && start.length > 'invite_'.length) {
      return { kind: 'invite', token: start.slice('invite_'.length) };
    }
    if (start?.startsWith('sos_') && start.length > 'sos_'.length) {
      return { kind: 'sos', id: start.slice('sos_'.length) };
    }

    if (parts.length === 1 && head && !RESERVED.has(head.toLowerCase())) {
      return { kind: 'invite', token: decodePart(head) };
    }
    return { kind: 'unknown' };
  }

  if (/^[A-Za-z0-9_-]{3,80}$/.test(text)) return { kind: 'invite', token: text };
  return { kind: 'unknown' };
}

export type CameraProbe = 'ok' | 'missing' | 'unsupported';

/**
 * Desktop with an empty camera list stays on the empty state and does not ask for permission.
 * Phones often hide the list until permission, so they still count as ok.
 */
export async function probeCamera(): Promise<CameraProbe> {
  if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices.enumerateDevices) return 'unsupported';
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (devices.some((device) => device.kind === 'videoinput')) return 'ok';
  } catch {
    return 'ok';
  }
  return detectDevice() === 'desktop' ? 'missing' : 'ok';
}

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function barcodeDetector(): Detector | null {
  const ctor = (window as unknown as {
    BarcodeDetector?: new (options?: { formats?: string[] }) => Detector;
  }).BarcodeDetector;
  if (!ctor) return null;
  try {
    return new ctor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

export type ScanPhase = 'live' | 'denied' | 'missing' | 'unsupported' | 'error';

export interface ScanSession {
  phase: ScanPhase;
  torch: boolean;
  stop: () => void;
  toggleTorch: () => Promise<void>;
}

interface StartOptions {
  video: HTMLVideoElement | null;
  onCode: (value: string) => void;
  paused: () => boolean;
}

function idle(phase: ScanPhase): ScanSession {
  return { phase, torch: false, stop: () => undefined, toggleTorch: async () => undefined };
}

function cameraPhase(error: unknown): ScanPhase {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
  return 'error';
}

function unimplemented(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /not implemented|unimplemented/i.test(message);
}

const NATIVE_STYLE_ID = 'so-barcode-scanner-active';

function setNativeChrome(on: boolean): void {
  document.documentElement.classList.toggle('barcode-scanner-active', on);
  if (!on) {
    document.getElementById(NATIVE_STYLE_ID)?.remove();
    return;
  }
  if (document.getElementById(NATIVE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = NATIVE_STYLE_ID;
  // The camera is behind the WebView. Only the shell paints are cleared; the scanner chrome keeps its own fills.
  style.textContent = [
    'html.barcode-scanner-active,',
    'html.barcode-scanner-active body,',
    'html.barcode-scanner-active body::before,',
    'html.barcode-scanner-active #root,',
    'html.barcode-scanner-active [data-shell] {',
    'background: transparent !important;',
    'background-color: transparent !important;',
    '}',
  ].join('');
  document.head.appendChild(style);
}

async function startNative(options: StartOptions): Promise<ScanSession | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { BarcodeScanner, BarcodeFormat, LensFacing } = await import('@capacitor-mlkit/barcode-scanning');
    const support = await BarcodeScanner.isSupported();
    if (!support.supported) return idle('missing');

    let permission = await BarcodeScanner.checkPermissions();
    if (permission.camera !== 'granted') {
      permission = await BarcodeScanner.requestPermissions();
    }
    if (permission.camera !== 'granted') return idle('denied');

    let torch = false;
    try {
      torch = (await BarcodeScanner.isTorchAvailable()).available;
    } catch {
      torch = false;
    }

    await BarcodeScanner.addListener('barcodesScanned', (event) => {
      if (options.paused()) return;
      const value = event.barcodes[0]?.rawValue;
      if (value) options.onCode(value);
    });

    setNativeChrome(true);
    await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode], lensFacing: LensFacing.Back });

    return {
      phase: 'live',
      torch,
      stop: () => {
        setNativeChrome(false);
        void BarcodeScanner.stopScan().catch(() => undefined);
        void BarcodeScanner.removeAllListeners().catch(() => undefined);
      },
      toggleTorch: async () => {
        if (!torch) return;
        await BarcodeScanner.toggleTorch();
      },
    };
  } catch (error) {
    setNativeChrome(false);
    if (unimplemented(error)) return null;
    const message = error instanceof Error ? error.message : '';
    if (/permission|denied/i.test(message)) return idle('denied');
    return null;
  }
}

async function startWeb(options: StartOptions): Promise<ScanSession> {
  const video = options.video;
  if (!video || !navigator.mediaDevices?.getUserMedia) return idle('unsupported');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' } },
    });
  } catch (error) {
    return idle(cameraPhase(error));
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  try {
    await video.play();
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    return idle('error');
  }

  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
  const torch = Boolean(caps?.torch);
  let torchOn = false;
  let stopped = false;
  let frame = 0;
  let busy = false;
  let last = 0;
  const detector = barcodeDetector();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const read = async () => {
    if (stopped || options.paused() || video.readyState < 2) return;
    if (detector) {
      const codes = await detector.detect(video);
      const value = codes[0]?.rawValue;
      if (value) options.onCode(value);
      return;
    }
    if (!ctx || !video.videoWidth) return;
    const width = Math.min(video.videoWidth, 480);
    const height = Math.max(1, Math.round(video.videoHeight * (width / video.videoWidth)));
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(video, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
    if (code?.data) options.onCode(code.data);
  };

  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    if (busy || now - last < 140) return;
    last = now;
    busy = true;
    void read()
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  };
  frame = requestAnimationFrame(tick);

  return {
    phase: 'live',
    torch,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((item) => item.stop());
      video.srcObject = null;
    },
    toggleTorch: async () => {
      if (!track || !torch) return;
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] } as unknown as MediaTrackConstraints);
    },
  };
}

/**
 * Capacitor ML Kit, camera behind the WebView.
 * Returns null when the plugin is not on this platform, so the caller can use the browser camera.
 */
export function openNativeScanner(options: StartOptions): Promise<ScanSession | null> {
  return startNative(options);
}

/** getUserMedia plus BarcodeDetector, or jsQR when the browser has no detector. */
export function openWebScanner(options: StartOptions): Promise<ScanSession> {
  return startWeb(options);
}

export async function openScannerSettings(): Promise<void> {
  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  await BarcodeScanner.openSettings();
}
