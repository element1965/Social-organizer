import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { NetFigure } from '../components/figures';
import { Button, Card, Input } from '../components/ui2';
import { BackLink, BrandLine, OnboardingFrame, StepText, usePanelLayout } from '../components/onboarding/OnboardingFrame';
import { SignInFlow } from '../components/onboarding/SignInFlow';
import { useNetLabels } from '../components/onboarding/figureLabels';
import { CheckGlyph, StateTile, TextButton } from '../components/onboarding/states';
import { getLastLoginMethod, type LoginMethod } from '../hooks/useAuth';
import { inviteCodeFromInput, readPendingInvite } from '../components/onboarding/flow';

const METHOD_NAME: Record<LoginMethod, string> = { google: 'Google', apple: 'Apple', telegram: 'Telegram', email: 'e-mail' };

/**
 * Sign-in for new and existing people (screens.md §13, onboarding.html №2–4, auth.html): one screen, buttons by
 * device, e-mail last. The server decides whether the account is new; no password is needed (the password form
 * for old accounts opens only via /login?mode=password).
 * States carried in the URL: ?reason=expired (№21), ?error=cancelled|failed|account_exists (№11–13), ?deleted=1 (№24).
 */
export function LoginPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const redirect = params.get('redirect');
  const expired = params.get('reason') === 'expired';
  const labels = useNetLabels();
  const panel = usePanelLayout();
  const last = getLastLoginMethod();

  if (params.get('deleted') === '1') return <AccountDeleted />;

  // A plaque over the buttons shrinks the picture so the rhythm holds; on the desktop panel the expired state has none
  const withNotice = !!params.get('error') && params.get('error') !== 'account_exists';
  const picture = expired && panel ? null : (
    <div className={withNotice || expired ? 'mt-4 flex h-[150px] items-center justify-center' : 'mt-4 flex h-[240px] items-center justify-center'}>
      <NetFigure step={0} labels={labels} className="h-full w-auto" />
    </div>
  );

  const methodName = last && last !== 'email' ? METHOD_NAME[last] : null;
  const viaEmail = last === 'email';

  return (
    <SignInFlow
      // The website's home is the landing page; inside the app there is nothing before sign-in
      top={
        Capacitor.isNativePlatform() ? (
          <BrandLine />
        ) : (
          <BackLink label={t('common.back')} to={redirect ? `/?redirect=${encodeURIComponent(redirect)}` : '/'} />
        )
      }
      redirect={redirect}
      last={last}
      hero={
        <>
          {picture}
          {expired ? (
            <StepText title={t('login.expiredTitle')}>
              {methodName ? (
                <Trans i18nKey="login.expiredTextLast" values={{ method: methodName }} components={{ b: <b /> }} />
              ) : viaEmail ? (
                <Trans i18nKey="login.expiredTextEmail" components={{ b: <b /> }} />
              ) : (
                t('login.expiredText')
              )}
            </StepText>
          ) : (
            <StepText title={t('login.title')}>
              {t('login.text')}
              {methodName || viaEmail ? (
                <>
                  {' '}
                  <Trans
                    i18nKey={viaEmail ? 'login.lastMethodEmail' : 'login.lastMethod'}
                    values={{ method: methodName }}
                    components={{ b: <b /> }}
                  />
                </>
              ) : null}
            </StepText>
          )}
          {/* Nobody to accept yet: the invitation may have come as a code (SO-24 п.1) */}
          {!redirect && !readPendingInvite() ? <InviteCodeEntry /> : null}
        </>
      }
    />
  );
}

/**
 * "I have an invitation code" (SO-24 п.1): for someone who installed the app without opening the link, or got
 * the code from a person in words. Takes the bare code, a personal address or a whole pasted link, and opens
 * the same invite page as the link does, so the request is created only there, after sign-in.
 */
function InviteCodeEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [bad, setBad] = useState(false);

  if (!open) {
    return (
      <div className="mt-3">
        <TextButton tone="care" onClick={() => setOpen(true)}>
          {t('login.inviteCode')}
        </TextButton>
      </div>
    );
  }
  return (
    <form
      className="mt-4 w-full"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const code = inviteCodeFromInput(value);
        if (!code) return setBad(true);
        navigate(`/invite/${encodeURIComponent(code)}`);
      }}
    >
      <Card>
        <Input
          id="invite-code"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          label={t('login.inviteCodeLabel')}
          placeholder={t('login.inviteCodePlaceholder')}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (bad) setBad(false);
          }}
          error={bad ? t('login.inviteCodeBad') : undefined}
        />
        <Button type="submit" className="mt-4 w-full" disabled={!value.trim()}>
          {t('login.inviteCodeOpen')}
        </Button>
      </Card>
    </form>
  );
}

/** №24: after user.delete, instead of a silent jump to the sign-in screen. */
function AccountDeleted() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <OnboardingFrame
      top={<BrandLine />}
      centre
      foot={
        <>
          <Button
            className="w-full"
            // The website's home is the landing page; inside the app there is nothing but sign-in
            onClick={() => navigate(Capacitor.isNativePlatform() ? '/login' : '/', { replace: true })}
          >
            {t('login.deletedHome')}
          </Button>
          <TextButton onClick={() => navigate('/login', { replace: true })}>{t('login.deletedNew')}</TextButton>
        </>
      }
    >
      <div className="mt-[72px]">
        <StateTile>
          <CheckGlyph />
        </StateTile>
      </div>
      <h1 className="mt-4 text-h2 font-bold [text-wrap:balance]">{t('login.deletedTitle')}</h1>
      <p className="mt-2.5 max-w-[30ch] text-body-s text-ink-muted">{t('login.deletedText')}</p>
    </OnboardingFrame>
  );
}
