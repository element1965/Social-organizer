import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { QR_LOGO_LEVEL, qrLogo } from '../../lib/qrLogo';

const RING = 2 * Math.PI * 126;

type QrCodeViewProps = {
  /** What the code holds; empty while a new code is on its way. */
  url: string;
  /** The part of the code's life that is left, 0 to 1 (the ring around it). */
  fraction: number;
  /** "0:45" when a code is displayed. */
  timeLabel: string | null;
  failed?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
};

/**
 * The live QR as the person sees it: the code with the countdown ring, the time left and the hint. LiveQr feeds it
 * fresh codes; the landing's "In the app" chapter shows it still.
 */
export function QrCodeView({ url, fraction, timeLabel, failed, retrying, onRetry }: QrCodeViewProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="relative mt-4 grid h-[260px] w-[260px] max-w-full place-items-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 260 260" aria-hidden>
          <circle cx="130" cy="130" r="126" className="fill-none stroke-line-strong" strokeWidth="3" />
          <circle
            cx="130"
            cy="130"
            r="126"
            className="fill-none stroke-care"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * (1 - fraction)}
          />
        </svg>
        {/* Always black on white with a 4-module quiet zone, whatever the theme: phone cameras and Google Lens
            do not find a code that touches a dark background, only our own scanner forgives that. */}
        <div className="grid h-[200px] w-[200px] place-items-center overflow-hidden rounded-xl bg-white shadow-float" role="img" aria-label={t('add.myQr')}>
          {url ? (
            <QRCodeSVG
              value={url}
              size={196}
              marginSize={4}
              level={QR_LOGO_LEVEL}
              imageSettings={qrLogo(196)}
              fgColor="#000000"
              bgColor="#ffffff"
            />
          ) : null}
        </div>
      </div>
      <p
        className={`mt-3.5 text-h2 font-extrabold tabular-nums text-ink${timeLabel ? '' : ' invisible'}`}
        role="timer"
        aria-live="off"
        aria-label={timeLabel ? t('add.qrTimeLeft', { time: timeLabel }) : undefined}
      >
        {timeLabel ?? '1:00'}
      </p>
      <p className="mt-1.5 max-w-[30ch] text-caption font-semibold text-ink-muted">{t('add.qrHint')}</p>
      {failed ? (
        <button
          type="button"
          className="so-focus relative mt-3 min-h-7 text-label font-bold text-sos before:absolute before:-inset-2 disabled:opacity-50"
          disabled={retrying}
          aria-busy={retrying || undefined}
          onClick={onRetry}
        >
          {t('add.qrError')}
        </button>
      ) : null}
    </>
  );
}
