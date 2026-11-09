import { Capacitor } from '@capacitor/core';
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

const TOKEN = /^[A-Za-z0-9_-]+$/;
const BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'socialorganizer_bot').toLowerCase();

function tokenOf(value: string): string | null {
  const decoded = decodePart(value).trim();
  return TOKEN.test(decoded) ? decoded : null;
}

/** App origins that may carry an invite. Anything else is not our code. */
function isOurHost(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'orginizer.com' || hostname === 'www.orginizer.com') return true;
  try {
    return url.host.toLowerCase() === new URL(window.location.origin).host.toLowerCase();
  } catch {
    return false;
  }
}

function isOurBot(url: URL): boolean {
  if (url.hostname.toLowerCase() !== 't.me') return false;
  const bot = url.pathname.split('/').filter(Boolean)[0];
  return bot?.toLowerCase() === BOT;
}

function fromStartParam(start: string | null): ScanTarget | null {
  if (!start) return null;
  if (start.startsWith('invite_')) {
    const token = tokenOf(start.slice('invite_'.length));
    return token ? { kind: 'invite', token } : { kind: 'unknown' };
  }
  if (start.startsWith('sos_')) {
    const id = tokenOf(start.slice('sos_'.length));
    return id ? { kind: 'sos', id } : { kind: 'unknown' };
  }
  return null;
}

/**
 * Turn a scanned string into an invite token or a collection id.
 * A URL counts only on our origin (this page, orginizer.com, www.orginizer.com)
 * or as t.me/<bot> start params. /sos/<id> accepts only an id of letters, digits, "_" and "-".
 * Any other string is not our code.
 */
export function parseScannedText(raw: string): ScanTarget {
  const text = raw.trim();
  if (!text) return { kind: 'unknown' };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { kind: 'unknown' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'unknown' };

  if (isOurBot(url)) {
    return fromStartParam(url.searchParams.get('start') || url.searchParams.get('startapp')) ?? { kind: 'unknown' };
  }
  if (!isOurHost(url)) return { kind: 'unknown' };

  const parts = url.pathname.split('/').filter(Boolean);
  const head = parts[0] ? decodePart(parts[0]) : undefined;
  const second = parts[1] ? decodePart(parts[1]) : undefined;
  if (head === 'sos') {
    return second && TOKEN.test(second) ? { kind: 'sos', id: second } : { kind: 'unknown' };
  }

  const inviteAt = parts.findIndex((part) => decodePart(part) === 'invite');
  const inviteToken = inviteAt >= 0 ? parts[inviteAt + 1] : undefined;
  if (inviteToken) {
    const token = tokenOf(inviteToken);
    return token ? { kind: 'invite', token } : { kind: 'unknown' };
  }

  const queryInvite = url.searchParams.get('invite');
  if (queryInvite) {
    const token = tokenOf(queryInvite);
    return token ? { kind: 'invite', token } : { kind: 'unknown' };
  }

  if (parts.length === 1 && head && TOKEN.test(head) && !RESERVED.has(head.toLowerCase())) {
    return { kind: 'invite', token: head };
  }
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
  signal?: AbortSignal;
  isCancelled?: () => boolean;
}

function cancelled(options: StartOptions): boolean {
  return Boolean(options.signal?.aborted || options.isCancelled?.());
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
  let scanner: typeof import('@capacitor-mlkit/barcode-scanning') | null = null;
  try {
    scanner = await import('@capacitor-mlkit/barcode-scanning');
    const { BarcodeScanner, BarcodeFormat, LensFacing } = scanner;
    const support = await BarcodeScanner.isSupported();
    // Unsupported here means "no native scanner", so the caller opens the browser camera.
    if (support.supported === false) return null;

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
    if (scanner) {
      await scanner.BarcodeScanner.removeAllListeners().catch(() => undefined);
      await scanner.BarcodeScanner.stopScan().catch(() => undefined);
    }
    if (unimplemented(error)) return null;
    const message = error instanceof Error ? error.message : '';
    if (/permission|denied/i.test(message)) return idle('denied');
    return null;
  }
}

async function startWeb(options: StartOptions): Promise<ScanSession> {
  const video = options.video;
  if (cancelled(options)) return idle('error');
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

  const release = () => {
    stream.getTracks().forEach((track) => track.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };

  // The caller may have unmounted or hidden the page while the prompt was open.
  if (cancelled(options)) {
    release();
    return idle('error');
  }

  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  if (cancelled(options)) {
    release();
    return idle('error');
  }
  try {
    await video.play();
  } catch {
    release();
    return idle('error');
  }
  if (cancelled(options)) {
    release();
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
  // jsQR is only fetched when this browser has no BarcodeDetector.
  const jsQR = detector ? null : (await import('jsqr')).default;
  if (cancelled(options)) {
    release();
    return idle('error');
  }

  const read = async () => {
    if (stopped || options.paused() || video.readyState < 2) return;
    if (detector) {
      const codes = await detector.detect(video);
      const value = codes[0]?.rawValue;
      if (value) options.onCode(value);
      return;
    }
    if (!jsQR || !ctx || !video.videoWidth) return;
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
      release();
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
