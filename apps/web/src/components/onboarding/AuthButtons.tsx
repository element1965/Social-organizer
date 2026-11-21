/*
 * Sign-in buttons in the device order from lib/device.ts (AUTH_ORDER), e-mail last as a text link,
 * then the legal line. The logic lives in useSignIn; this file only draws it.
 */
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import type { LoginMethod } from '../../hooks/useAuth';
import { AppleMark, GoogleMark, TelegramMark } from './brand';
import type { SignIn } from './useSignIn';

/** The method used last time: a care ring on its own button (the order never changes). */
const LAST_RING = 'ring-2 ring-inset ring-care';
const OUTLINE = 'border border-line bg-surface text-ink hover:bg-surface-2';
const PRIMARY = 'bg-care text-care-on hover:bg-care-hover';
const MARKS = { apple: AppleMark, google: GoogleMark, telegram: TelegramMark };

function AuthButton({
  children,
  icon,
  className,
  onClick,
  disabled,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string | false;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'so-focus flex h-primary w-full items-center justify-center gap-2.5 rounded-lg text-body-l font-bold tracking-tight',
        'transition-[transform,background-color] duration-fast ease-so active:scale-[0.97] disabled:opacity-[0.45] motion-reduce:transition-none',
        className,
      )}
    >
      {icon ? <span className="inline-flex h-5 w-5 shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}

export function AuthButtons({
  signIn,
  onEmail,
  last,
  notice,
  email = true,
  legal = true,
}: {
  signIn: SignIn;
  onEmail?: () => void;
  /** Ring the button of the method used last time. */
  last?: LoginMethod | null;
  /** A status plaque above the buttons (cancelled, failed). */
  notice?: ReactNode;
  /** The e-mail text link after the buttons (off where e-mail is what just failed). */
  email?: boolean;
  legal?: boolean;
}) {
  const { t } = useTranslation();
  const { providers, start, busy, inTelegram } = signIn;

  return (
    <div className="w-full text-start">
      {notice ? <div className="mb-3">{notice}</div> : null}
      <div className="flex flex-col gap-2.5">
        {providers.map((provider, index) => {
          if (provider === 'email') return null;
          const Mark = MARKS[provider];
          const telegram = provider === 'telegram';
          const tone = telegram
            ? inTelegram ? 'bg-telegram text-on-telegram' : cn(OUTLINE, 'border-telegram')
            : index === 0 ? PRIMARY : OUTLINE;
          return (
            <AuthButton
              key={provider}
              icon={<Mark className={telegram && !inTelegram ? 'text-telegram' : undefined} />}
              className={cn(tone, last === provider && LAST_RING, last === provider && tone === PRIMARY && 'ring-care-on')}
              onClick={() => start(provider)}
              disabled={busy}
            >
              {t(`login.${provider}`)}
            </AuthButton>
          );
        })}
      </div>

      {email && onEmail && providers.includes('email') ? (
        last === 'email' ? (
          // Used last time: a full button of the same size as the others, ringed like any last-used method
          <div className="mt-2.5">
            <AuthButton onClick={onEmail} disabled={busy} className={cn('border border-line bg-surface text-ink', LAST_RING)}>
              {t('login.email')}
            </AuthButton>
          </div>
        ) : (
          // Otherwise e-mail stays a quiet text link under the buttons (auth.html), with the same 10 px rhythm
          <button
            type="button"
            onClick={onEmail}
            disabled={busy}
            className="so-focus mt-2.5 block min-h-11 w-full rounded-lg text-center text-body-s font-bold text-care"
          >
            {t('login.email')}
          </button>
        )
      ) : null}
      {legal ? <LegalLine /> : null}
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
