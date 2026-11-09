/*
 * Sign-in buttons in the device order from lib/device.ts (AUTH_ORDER), e-mail last as a text link,
 * then the legal line. The logic lives in useSignIn; this file only draws it.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { AppleMark, GoogleMark, TELEGRAM_BG, TELEGRAM_FG, TelegramMark } from './brand';
import type { SignIn } from './useSignIn';

function AuthButton({
  children,
  icon,
  className,
  style,
  onClick,
  disabled,
}: {
  children: ReactNode;
  icon: ReactNode;
  className: string;
  style?: CSSProperties;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={cn(
        'so-focus flex h-primary w-full items-center justify-center gap-2.5 rounded-lg text-body-l font-bold tracking-tight',
        'transition-transform duration-fast ease-so active:scale-[0.97] disabled:opacity-[0.45] motion-reduce:transition-none',
        className,
      )}
    >
      <span className="inline-flex h-5 w-5 shrink-0">{icon}</span>
      {children}
    </button>
  );
}

export function AuthButtons({ signIn, onEmail }: { signIn: SignIn; onEmail: () => void }) {
  const { t } = useTranslation();
  const { providers, start, busy, useWidget, attachWidget, googleBtnRef, error } = signIn;

  return (
    <div className="w-full text-left">
      <div className="flex flex-col gap-2.5">
        {providers.map((p) => {
          if (p === 'apple') {
            return (
              <AuthButton key={p} icon={<AppleMark />} className="bg-ink text-canvas" onClick={() => start('apple')} disabled={busy}>
                {t('login.apple')}
              </AuthButton>
            );
          }
          if (p === 'google') {
            return (
              <div key={p}>
                <AuthButton
                  icon={<GoogleMark />}
                  className="border border-line bg-surface text-ink"
                  onClick={() => start('google')}
                  disabled={busy}
                >
                  {t('login.google')}
                </AuthButton>
                <div ref={googleBtnRef} className="hidden" />
              </div>
            );
          }
          if (p === 'telegram') {
            return useWidget ? (
              // Telegram's own Login Widget (server-checked); it cannot be restyled
              <div key={p} ref={attachWidget} className="flex min-h-primary w-full items-center justify-center" />
            ) : (
              <AuthButton
                key={p}
                icon={<TelegramMark />}
                className=""
                style={{ background: TELEGRAM_BG, color: TELEGRAM_FG }}
                onClick={() => start('telegram')}
                disabled={busy}
              >
                {t('login.telegram')}
              </AuthButton>
            );
          }
          return null;
        })}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-center text-caption font-semibold text-sos">
          {error}
        </p>
      ) : null}

      {providers.includes('email') ? (
        <button
          type="button"
          onClick={onEmail}
          disabled={busy}
          className="so-focus mt-2 block min-h-11 w-full text-center text-body-s font-bold text-care"
        >
          {t('login.email')}
        </button>
      ) : null}
      <LegalLine />
    </div>
  );
}

export function LegalLine() {
  return (
    <p className="mt-1 text-center text-micro text-ink-muted">
      <Trans
        i18nKey="login.legal"
        components={{
          terms: <Link to="/terms" className="font-bold text-ink-muted" />,
          privacy: <Link to="/privacy" className="font-bold text-ink-muted" />,
        }}
      />
    </p>
  );
}
